#!/usr/bin/env python3
"""Build the HackerPacks card catalog from open-index/hacker-news Parquet.

Reads monthly files over HTTP with DuckDB (no full mirror download) and writes
data/catalog.json plus public/data/catalog.json.

    pip install -r requirements.txt
    python3 scripts/build_catalog.py
    python3 scripts/build_catalog.py --from 2016-01 --to 2016-03
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlparse

import duckdb

BASE = "https://huggingface.co/datasets/open-index/hacker-news/resolve/main/data"
SOURCE = "https://huggingface.co/datasets/open-index/hacker-news"
LICENSE = "ODC-By"

# Per-year caps keep the deck museum-like instead of only the highest modern scores.
CAPS = {
    "book": 18,
    "video": 20,
    "showhn": 20,
    "comment": 16,
    "classic": 16,
    "paper": 10,
    "oss": 12,
    "poll": 5,
    "timemachine": 4,
    "cursed": 3,
}

YT_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:[^\"'\s<>]*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})",
    re.I,
)
URL_RE = re.compile(r"https?://[^\s<>()\"']+", re.I)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
ISBN_RE = re.compile(r"\b(97[89]\d{10}|\d{9}[\dXx])\b")
ARXIV_RE = re.compile(r"arxiv\.org/(?:abs|pdf|html)/(\d{4}\.\d{4,5})", re.I)
GH_RE = re.compile(r"github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)", re.I)
REC_RE = re.compile(
    r"\b(recommend(?:ed|s)?|must[- ]read|you should read|favourite book|favorite book|highly recommend)\b",
    re.I,
)
SHOW_RE = re.compile(r"(?i)^show\s+hn\s*[:\-–]\s*")
POLL_RE = re.compile(r"(?i)^poll\s*[:\-–]\s*")
AMAZON_RE = re.compile(
    r"https?://(?:[\w.-]+\.)?amazon\.[a-z.]+/(?:([\w%.-]+)/)?(?:dp|gp/product|gp/aw/d)/([A-Za-z0-9]{10})",
    re.I,
)
GR_RE = re.compile(
    r"https?://(?:www\.)?goodreads\.com/book/show/(\d+)(?:[./_-]([^/?#\s]+))?",
    re.I,
)
OL_RE = re.compile(
    r"https?://openlibrary\.org/(works|books|isbn)/([A-Za-z0-9]+)/?([^/?#\s]*)?",
    re.I,
)
BOOKSHOP_RE = re.compile(r"https?://bookshop\.org/[^\s<>()\"']+", re.I)
GBOOKS_RE = re.compile(r"https?://books\.google\.[a-z.]+/[^\s<>()\"']+", re.I)
PAPER_HOSTS = (
    "arxiv.org",
    "dl.acm.org",
    "ieeexplore.ieee.org",
    "aclanthology.org",
    "openreview.net",
    "proceedings.mlr.press",
    "nature.com",
    "science.org",
    "sciencemag.org",
    "pnas.org",
    "jmlr.org",
    "nips.cc",
    "papers.nips.cc",
    "semanticscholar.org",
)
GH_SKIP = {
    "topics",
    "features",
    "site",
    "about",
    "marketplace",
    "settings",
    "orgs",
    "collections",
    "explore",
    "trending",
    "sponsors",
    "customer-stories",
    "readme",
    "apps",
    "login",
    "signup",
    "pricing",
    "security",
    "issues",
    "pulls",
    "notifications",
    "new",
    "codespaces",
    "account",
    "search",
    "gist",
}
TITLE_STOP = {
    "amazon",
    "kindle",
    "product",
    "books",
    "book",
    "hardcover",
    "paperback",
    "ebook",
    "pdf",
    "http",
    "www",
    "ref",
    "node",
    "dp",
    "gp",
    "com",
}
DEVICE_RE = re.compile(
    r"\b(echo dot|fire tv|fire tablet|kindle paperwhite|kindle oasis|kindle voyage|prime video|alexa)\b",
    re.I,
)
LEGENDARY_SQL = "%quite trivially by getting an FTP account%"


def log(msg: str) -> None:
    print(msg, flush=True)


def months_between(start: str, end: str) -> list[str]:
    sy, sm = (int(x) for x in start.split("-"))
    ey, em = (int(x) for x in end.split("-"))
    out = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            m = 1
            y += 1
    return out


def clean_text(raw: str | None, limit: int = 1500) -> str:
    if not raw:
        return ""
    text = html.unescape(raw)
    text = text.replace("<p>", "\n").replace("<br>", "\n").replace("<br/>", "\n")
    text = TAG_RE.sub(" ", text)
    text = WS_RE.sub(" ", text).replace(" \n ", "\n").strip()
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def excerpt(raw: str | None) -> str:
    text = clean_text(raw, 420)
    if len(text) <= 300:
        return text
    cut = text[:300]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:") + "…"


def day_of(ts) -> str:
    if ts is None:
        return ""
    if hasattr(ts, "astimezone"):
        try:
            return ts.astimezone(timezone.utc).date().isoformat()
        except Exception:
            return ts.date().isoformat()
    return str(ts)[:10]


def year_of(day: str) -> int:
    try:
        return int(day[:4])
    except Exception:
        return 0


def domain_of(url: str) -> str:
    if not url:
        return ""
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def nice_title(slug: str) -> str:
    slug = unquote(slug or "")
    slug = slug.replace("+", " ").replace("_", " ")
    bits = [bit for bit in slug.split("-") if bit != ""]
    words: list[str] = []
    for bit in bits:
        if words and len(words[-1]) == 1 and bit[:1].isalpha():
            words[-1] = f"{words[-1]}-{bit}"
        else:
            words.append(bit)
    slug = " ".join(words)
    slug = re.sub(r"\.(html?|php|aspx?)$", "", slug, flags=re.I)
    slug = WS_RE.sub(" ", slug).strip(" .-|")
    slug = re.sub(r"\s+\d{6,}$", "", slug).strip()
    if slug.isupper() and len(slug) > 6:
        slug = slug.title()
    return slug


def title_ok(title: str) -> bool:
    if not title or len(title) < 4 or len(title) > 160:
        return False
    words = re.findall(r"[A-Za-z0-9']+", title)
    if not words:
        return False
    if len(words) == 1 and words[0].lower() in TITLE_STOP:
        return False
    if all(w.lower() in TITLE_STOP for w in words):
        return False
    letters = sum(c.isalpha() for c in title)
    return letters >= 3


def isbn_of(value: str) -> str | None:
    if not value:
        return None
    m = ISBN_RE.search(value.replace("-", ""))
    if not m:
        return None
    token = m.group(1)
    if len(token) == 10 or (len(token) == 13 and token.startswith(("978", "979"))):
        return token.upper()
    return None


def safe_id(prefix: str, raw: str) -> str:
    body = re.sub(r"[^a-zA-Z0-9_-]+", "", str(raw))[:72]
    if not body:
        body = hashlib.sha1(str(raw).encode()).hexdigest()[:12]
    return f"{prefix}_{body}"


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET enable_progress_bar = false;")
    return con


def month_url(ym: str) -> str:
    year = ym[:4]
    return f"{BASE}/{year}/{ym}.parquet"


def fetch_month(ym: str) -> dict:
    url = month_url(ym)
    con = connect()
    started = time.time()
    try:
        stories = con.execute(
            f"""
            SELECT id, "by" AS author, time, title,
                   left(coalesce(text, ''), 500) AS text,
                   coalesce(url, '') AS url,
                   coalesce(score, 0) AS score,
                   coalesce(descendants, 0) AS descendants,
                   coalesce(dead, 0) AS dead
            FROM read_parquet('{url}')
            WHERE type = 1
              AND coalesce(deleted, 0) = 0
              AND (
                (title ILIKE 'Show HN%' AND score >= 10 AND coalesce(dead, 0) = 0)
                OR (
                  coalesce(dead, 0) = 0 AND score >= 20 AND (
                    url ILIKE '%youtu.be/%' OR url ILIKE '%youtube.com/%'
                    OR url ILIKE '%arxiv.org%' OR url ILIKE '%dl.acm.org%'
                    OR url ILIKE '%ieeexplore.ieee.org%' OR url ILIKE '%aclanthology.org%'
                    OR url ILIKE '%openreview.net%' OR url ILIKE '%github.com/%'
                    OR url ILIKE '%proceedings.mlr.press%' OR url ILIKE '%nature.com/%'
                    OR url ILIKE '%science.org/%' OR url ILIKE '%pnas.org%'
                    OR url ILIKE '%semanticscholar.org%'
                  )
                )
                OR (coalesce(dead, 0) = 0 AND score >= 140)
              )
            """
        ).fetchall()
        comments = con.execute(
            f"""
            WITH stories AS (
              SELECT id, title, coalesce(score, 0) AS score, coalesce(url, '') AS url
              FROM read_parquet('{url}')
              WHERE type = 1 AND coalesce(deleted, 0) = 0
            ),
            replies AS (
              SELECT parent AS id, count(*) AS n_replies
              FROM read_parquet('{url}')
              WHERE type = 2
                AND coalesce(deleted, 0) = 0
                AND coalesce(dead, 0) = 0
                AND parent > 0
              GROUP BY 1
            ),
            notes AS (
              SELECT c.id, c."by" AS author, c.time,
                     left(coalesce(c.text, ''), 3500) AS text,
                     coalesce(c.parent, 0) AS parent,
                     greatest(coalesce(len(c.kids), 0), coalesce(r.n_replies, 0)) AS n_kids,
                     (c.text ILIKE '%goodreads.com/book%'
                      OR c.text ILIKE '%openlibrary.org/%'
                      OR c.text ILIKE '%bookshop.org/%'
                      OR c.text ILIKE '%books.google.%'
                      OR (c.text ILIKE '%/dp/%' AND c.text ILIKE '%amazon.%')
                      OR (c.text ILIKE '%/gp/product/%' AND c.text ILIKE '%amazon.%')
                      OR c.text ILIKE '{LEGENDARY_SQL}') AS is_book
              FROM read_parquet('{url}') c
              LEFT JOIN replies r ON r.id = c.id
              WHERE c.type = 2
                AND coalesce(c.deleted, 0) = 0
                AND coalesce(c.dead, 0) = 0
                AND (
                  c.text ILIKE '%goodreads.com/book%'
                  OR c.text ILIKE '%openlibrary.org/%'
                  OR c.text ILIKE '%bookshop.org/%'
                  OR c.text ILIKE '%books.google.%'
                  OR (c.text ILIKE '%/dp/%' AND c.text ILIKE '%amazon.%')
                  OR (c.text ILIKE '%/gp/product/%' AND c.text ILIKE '%amazon.%')
                  OR c.text ILIKE '{LEGENDARY_SQL}'
                  OR c.id = 9224
                  OR (
                    greatest(coalesce(len(c.kids), 0), coalesce(r.n_replies, 0)) >= 2
                    AND length(coalesce(c.text, '')) BETWEEN 80 AND 8000
                  )
                )
            )
            SELECT id, author, time, text, parent, n_kids, story_title, story_score, story_url, story_id
            FROM (
              SELECT c.id, c.author, c.time, c.text, c.parent, c.n_kids, c.is_book,
                     s.title AS story_title, s.score AS story_score, s.url AS story_url, s.id AS story_id,
                     row_number() OVER (ORDER BY c.n_kids DESC) AS rn
              FROM notes c
              JOIN stories s ON c.parent = s.id
            )
            WHERE is_book OR rn <= 80
            """
        ).fetchall()
        mentions = con.execute(
            f"""
            WITH hits AS (
              SELECT regexp_extract(
                text,
                '(?:youtu\\.be/|youtube\\.com/(?:embed/|shorts/|live/)|[?&]v=)([A-Za-z0-9_-]{{11}})',
                1
              ) AS vid
              FROM read_parquet('{url}')
              WHERE type = 2
                AND coalesce(deleted, 0) = 0
                AND coalesce(dead, 0) = 0
                AND (
                  text ILIKE '%youtu.be/%'
                  OR text ILIKE '%youtube.com/watch%'
                  OR text ILIKE '%youtube.com/embed%'
                  OR text ILIKE '%youtube.com/shorts%'
                )
            )
            SELECT vid, count(*) FROM hits WHERE vid <> '' GROUP BY 1
            """
        ).fetchall()
        days = con.execute(
            f"""
            SELECT id, title, coalesce(url, '') AS url, score, time, descendants
            FROM (
              SELECT id, title, url, coalesce(score, 0) AS score, time,
                     coalesce(descendants, 0) AS descendants,
                     row_number() OVER (
                       PARTITION BY CAST(time AS DATE)
                       ORDER BY score DESC NULLS LAST
                     ) AS rn
              FROM read_parquet('{url}')
              WHERE type = 1
                AND coalesce(deleted, 0) = 0
                AND coalesce(dead, 0) = 0
                AND score > 0
                AND coalesce(title, '') <> ''
            )
            WHERE rn <= 8
            """
        ).fetchall()
        polls = con.execute(
            f"""
            SELECT id, "by" AS author, time, title,
                   left(coalesce(text, ''), 600) AS text,
                   coalesce(score, 0) AS score,
                   coalesce(descendants, 0) AS descendants
            FROM read_parquet('{url}')
            WHERE type = 3
              AND coalesce(deleted, 0) = 0
              AND coalesce(dead, 0) = 0
              AND coalesce(score, 0) >= 5
            """
        ).fetchall()
        options = con.execute(
            f"""
            SELECT id, poll, left(coalesce(text, ''), 220) AS text, coalesce(score, 0) AS score
            FROM read_parquet('{url}')
            WHERE type = 4 AND coalesce(deleted, 0) = 0
            """
        ).fetchall()
        cursed = con.execute(
            f"""
            SELECT id, title, time, coalesce(score, 0) AS score, coalesce(descendants, 0) AS descendants
            FROM read_parquet('{url}')
            WHERE type = 1
              AND coalesce(dead, 0) = 1
              AND coalesce(deleted, 0) = 0
              AND length(coalesce(title, '')) BETWEEN 18 AND 180
            ORDER BY descendants DESC NULLS LAST
            LIMIT 8
            """
        ).fetchall()
    except Exception as exc:
        message = str(exc).split("\n", 1)[0]
        if "404" in message or "HTTP" in message or "not found" in message.lower():
            log(f"  skip {ym} ({message[:140]})")
            return {"month": ym, "missing": True}
        raise
    finally:
        con.close()

    log(
        f"  {ym} stories={len(stories)} notes={len(comments)} days={len(days)} "
        f"polls={len(polls)} {time.time() - started:.1f}s"
    )
    return {
        "month": ym,
        "missing": False,
        "stories": stories,
        "comments": comments,
        "mentions": mentions,
        "days": days,
        "polls": polls,
        "options": options,
        "cursed": cursed,
    }


def is_paper(url: str) -> bool:
    host = domain_of(url)
    return any(host == h or host.endswith("." + h) for h in PAPER_HOSTS)


def github_repo(url: str) -> str | None:
    m = GH_RE.search(url or "")
    if not m:
        return None
    owner, repo = m.group(1), m.group(2)
    if owner.lower() in GH_SKIP or repo.lower() in {"issues", "pull", "pulls", "blob", "tree", "wiki", "releases", "actions"}:
        return None
    if owner.lower() in {"blog", "features", "about"}:
        return None
    return f"{owner}/{repo}"


def video_id(url: str) -> str | None:
    m = YT_RE.search(url or "")
    return m.group(1) if m else None


def classify_story(title: str, url: str, score: int, dead: int) -> str | None:
    if dead:
        return None
    if SHOW_RE.match(title or "") or (title or "").lower().startswith("show hn"):
        if score >= 10:
            return "showhn"
    vid = video_id(url)
    if vid and score >= 15:
        return "video"
    if is_paper(url) and score >= 20:
        return "paper"
    if github_repo(url) and score >= 25:
        return "oss"
    if score >= 140:
        return "classic"
    return None


def extract_books(text: str) -> list[dict]:
    found: list[dict] = []
    seen = set()
    raw = html.unescape(text or "")
    for url in URL_RE.findall(raw):
        url = url.rstrip(".,);]")
        item = None
        gm = GR_RE.search(url)
        if gm:
            slug = nice_title(gm.group(2) or "")
            item = {
                "key": f"gr{gm.group(1)}",
                "title": slug,
                "url": gm.group(0),
                "isbn": isbn_of(url),
                "source": "Goodreads",
            }
        if item is None:
            om = OL_RE.search(url)
            if om:
                kind, ident, slug = om.group(1), om.group(2), om.group(3) or ""
                isbn = ident if kind == "isbn" else isbn_of(url)
                item = {
                    "key": f"ol{ident}",
                    "title": nice_title(slug),
                    "url": om.group(0),
                    "isbn": isbn,
                    "source": "Open Library",
                }
        if item is None and BOOKSHOP_RE.search(url):
            path = urlparse(url).path
            slug = path.strip("/").split("/")[-1]
            item = {
                "key": "bs" + hashlib.sha1(url.encode()).hexdigest()[:10],
                "title": nice_title(slug),
                "url": url.split("?")[0],
                "isbn": isbn_of(url),
                "source": "Bookshop",
            }
        if item is None:
            am = AMAZON_RE.search(url)
            if am:
                slug, asin = am.group(1) or "", am.group(2)
                blob = f"{slug} {text[:500]}"
                if DEVICE_RE.search(blob):
                    continue
                item = {
                    "key": f"az{asin.upper()}",
                    "title": nice_title(slug),
                    "url": am.group(0),
                    "isbn": isbn_of(asin) or isbn_of(slug),
                    "source": "Amazon",
                }
        if item is None and GBOOKS_RE.search(url):
            gid = re.search(r"[?&]id=([A-Za-z0-9_-]+)", url)
            q = re.search(r"[?&]q=([^&]+)", url)
            item = {
                "key": f"gb{gid.group(1)}" if gid else "gb" + hashlib.sha1(url.encode()).hexdigest()[:10],
                "title": nice_title(q.group(1) if q else ""),
                "url": url.split("&")[0],
                "isbn": isbn_of(url),
                "source": "Google Books",
            }
        if item is None:
            continue
        if not title_ok(item["title"]):
            # Fall back to a quoted title near the link when the slug is empty.
            qm = re.search(r"[“\"]([A-Z][^”\"]{5,90})[”\"]", raw)
            if qm and title_ok(qm.group(1)):
                item["title"] = qm.group(1).strip()
            else:
                continue
        if item["key"] in seen:
            continue
        seen.add(item["key"])
        found.append(item)
    return found


def first_sentence(text: str, limit: int = 92) -> str:
    text = text.strip()
    parts = re.split(r"(?<=[.!?])\s+", text)
    sentence = parts[0] if parts else text
    if len(sentence) <= limit:
        return sentence
    cut = sentence[: limit - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip() + "…"


class Accumulator:
    def __init__(self) -> None:
        self.videos: dict[str, dict] = {}
        self.mentions: dict[str, int] = defaultdict(int)
        self.shows: dict[int, dict] = {}
        self.classics: dict[int, dict] = {}
        self.papers: dict[str, dict] = {}
        self.oss: dict[str, dict] = {}
        self.polls: dict[int, dict] = {}
        self.books: dict[str, dict] = {}
        self.comments: dict[int, dict] = {}
        self.days: dict[str, list] = {}
        self.cursed: dict[int, dict] = {}
        self.months: list[str] = []

    def merge(self, part: dict) -> None:
        if part.get("missing"):
            return
        self.months.append(part["month"])
        for vid, count in part["mentions"]:
            if vid:
                self.mentions[vid] += int(count)
        for row in part["stories"]:
            self._story(row)
        for row in part["comments"]:
            self._comment(row)
        by_day: dict[str, list] = defaultdict(list)
        for row in part["days"]:
            ident, title, url, score, ts, descendants = row
            day = day_of(ts)
            if not day or not title:
                continue
            by_day[day].append(
                {
                    "id": int(ident),
                    "title": clean_text(title, 180),
                    "url": url or "",
                    "score": int(score or 0),
                    "descendants": int(descendants or 0),
                    "time": day,
                }
            )
        for day, items in by_day.items():
            items.sort(key=lambda x: x["score"], reverse=True)
            prev = self.days.get(day)
            if prev is None or items[0]["score"] > prev[0]["score"]:
                self.days[day] = items[:8]
        opt_by_poll: dict[int, list] = defaultdict(list)
        for ident, poll, text, score in part["options"]:
            if not poll:
                continue
            label = clean_text(text, 180)
            if not label:
                continue
            opt_by_poll[int(poll)].append({"id": int(ident), "text": label, "score": int(score or 0)})
        for row in part["polls"]:
            ident, author, ts, title, text, score, descendants = row
            title = POLL_RE.sub("", clean_text(title, 180)).strip()
            if not title_ok(title):
                continue
            options = sorted(opt_by_poll.get(int(ident), []), key=lambda o: o["score"], reverse=True)
            votes = sum(o["score"] for o in options) or int(score or 0)
            self.polls[int(ident)] = {
                "id": int(ident),
                "title": title,
                "text": clean_text(text, 400),
                "author": author or "",
                "day": day_of(ts),
                "score": int(score or 0),
                "descendants": int(descendants or 0),
                "votes": votes,
                "options": options[:6],
            }
        for ident, title, ts, score, descendants in part["cursed"]:
            title = clean_text(title, 180)
            if not title_ok(title):
                continue
            self.cursed[int(ident)] = {
                "id": int(ident),
                "title": title,
                "day": day_of(ts),
                "score": int(score or 0),
                "descendants": int(descendants or 0),
            }

    def _story(self, row) -> None:
        ident, author, ts, title, text, url, score, descendants, dead = row
        title = clean_text(title, 200)
        if not title:
            return
        kind = classify_story(title, url or "", int(score or 0), int(dead or 0))
        if kind is None:
            return
        day = day_of(ts)
        base = {
            "id": int(ident),
            "title": title,
            "url": url or "",
            "score": int(score or 0),
            "descendants": int(descendants or 0),
            "author": author or "",
            "day": day,
            "text": clean_text(text, 400),
        }
        if kind == "video":
            vid = video_id(url)
            if not vid:
                return
            slot = self.videos.get(vid)
            if slot is None:
                self.videos[vid] = {
                    "vid": vid,
                    "score": base["score"],
                    "descendants": base["descendants"],
                    "threads": 1,
                    "title": re.sub(r"\s*\[video\]\s*$", "", title, flags=re.I).strip(),
                    "url": url,
                    "hn_ids": [int(ident)],
                    "first": day,
                    "last": day,
                    "peak": day,
                    "best_score": base["score"],
                    "best_descendants": base["descendants"],
                }
            else:
                slot["score"] += base["score"]
                slot["threads"] += 1
                slot["hn_ids"].append(int(ident))
                if day and (not slot["first"] or day < slot["first"]):
                    slot["first"] = day
                if day and day > slot["last"]:
                    slot["last"] = day
                if base["score"] >= slot["best_score"]:
                    slot["best_score"] = base["score"]
                    slot["best_descendants"] = base["descendants"]
                    slot["peak"] = day
                    cleaned = re.sub(r"\s*\[video\]\s*$", "", title, flags=re.I).strip()
                    if title_ok(cleaned):
                        slot["title"] = cleaned
                        slot["url"] = url
                    slot["hn_ids"] = [int(ident)] + [i for i in slot["hn_ids"] if i != int(ident)]
        elif kind == "showhn":
            base["title"] = SHOW_RE.sub("", title).strip() or title
            if title_ok(base["title"]):
                self.shows[int(ident)] = base
        elif kind == "paper":
            m = ARXIV_RE.search(url or "")
            key = f"arxiv{m.group(1)}" if m else f"p{int(ident)}"
            prev = self.papers.get(key)
            if prev is None or base["score"] > prev["score"]:
                base["key"] = key
                base["arxiv"] = m.group(1) if m else ""
                self.papers[key] = base
        elif kind == "oss":
            repo = github_repo(url or "")
            if not repo:
                return
            prev = self.oss.get(repo.lower())
            if prev is None or base["score"] > prev["score"]:
                base["repo"] = repo
                self.oss[repo.lower()] = base
        elif kind == "classic":
            self.classics[int(ident)] = base

    def _comment(self, row) -> None:
        ident, author, ts, text, parent, n_kids, story_title, story_score, story_url, story_id = row
        raw = text or ""
        cleaned = clean_text(raw, 1500)
        day = day_of(ts)
        books = extract_books(raw)
        recommend = 1 if REC_RE.search(cleaned) else 0
        blurb = excerpt(raw)
        for book in books:
            slot = self.books.get(book["key"])
            mention = {
                "id": int(ident),
                "by": author or "",
                "text": blurb,
                "time": day,
                "recommend": recommend,
            }
            if slot is None:
                self.books[book["key"]] = {
                    "key": book["key"],
                    "title": book["title"],
                    "url": book["url"],
                    "isbn": book["isbn"],
                    "source": book["source"],
                    "authors": set(),
                    "recs": 0,
                    "mentions": [],
                    "mention_ids": set(),
                    "first": day,
                    "last": day,
                }
                slot = self.books[book["key"]]
            else:
                if book["isbn"] and not slot["isbn"]:
                    slot["isbn"] = book["isbn"]
                if book["source"] == "Open Library":
                    slot["url"] = book["url"]
                    slot["source"] = book["source"]
                elif slot["source"] == "Amazon" and book["source"] in {"Goodreads", "Bookshop"}:
                    slot["url"] = book["url"]
                    slot["source"] = book["source"]
                if title_ok(book["title"]) and len(book["title"]) > len(slot["title"]):
                    slot["title"] = book["title"]
            if mention["id"] in slot["mention_ids"]:
                continue
            slot["mention_ids"].add(mention["id"])
            if author:
                slot["authors"].add(author)
            slot["recs"] += recommend
            if blurb and len(slot["mentions"]) < 8:
                slot["mentions"].append(mention)
            if day and (not slot["first"] or day < slot["first"]):
                slot["first"] = day
            if day and day > slot["last"]:
                slot["last"] = day
        # Legendary / scene comments are top-level replies with some traction, or the seeded Dropbox note.
        legendary = int(ident) == 9224
        if not legendary:
            if not cleaned or len(cleaned) < 80 or len(cleaned) > 1500:
                return
            if int(n_kids or 0) < 2:
                return
            if cleaned.lower() in {"[dead]", "[deleted]", "[flagged]"}:
                return
        story_title = clean_text(story_title, 180)
        self.comments[int(ident)] = {
            "id": int(ident),
            "by": author or "anonymous",
            "text": cleaned if len(cleaned) <= 1500 else cleaned[:1499] + "…",
            "day": day,
            "n_kids": int(n_kids or 0),
            "story_id": int(story_id or parent or 0),
            "story_title": story_title,
            "story_score": int(story_score or 0),
            "story_url": story_url or "",
            "legendary": legendary,
        }


def cap_by_year(items: list[dict], year_key, score_key, cap: int) -> list[dict]:
    grouped: dict[int, list] = defaultdict(list)
    for item in items:
        grouped[year_key(item)].append(item)
    kept = []
    for year, group in grouped.items():
        if year <= 0:
            continue
        group.sort(key=lambda x: score_key(x), reverse=True)
        kept.extend(group[:cap])
    return kept


def assign_rarity(cards: list[dict]) -> None:
    cards.sort(key=lambda c: (c["heat_score"], c["card_id"]))
    n = len(cards)
    if n == 0:
        return
    for i, card in enumerate(cards):
        p = (i + 1) / n
        if p > 0.99:
            rarity = "UR"
        elif p > 0.95:
            rarity = "SSR"
        elif p > 0.83:
            rarity = "SR"
        elif p > 0.55:
            rarity = "R"
        else:
            rarity = "C"
        card["rarity"] = rarity
    if n >= 30 and cards[-1]["rarity"] != "UR":
        cards[-1]["rarity"] = "UR"


def heat_percentile(cards: list[dict]) -> dict[str, float]:
    ordered = sorted(cards, key=lambda c: c["heat_score"])
    n = len(ordered) or 1
    return {c["card_id"]: (i + 1) / n for i, c in enumerate(ordered)}


def build_cards(acc: Accumulator) -> list[dict]:
    videos = []
    for vid, slot in acc.videos.items():
        if not title_ok(slot["title"]):
            continue
        mentions = slot["threads"] + acc.mentions.get(vid, 0)
        heat = slot["score"] + acc.mentions.get(vid, 0) * 5
        videos.append({**slot, "heat": heat, "mentions": mentions, "year": year_of(slot["first"])})
    videos = cap_by_year(videos, lambda v: v["year"], lambda v: v["heat"], CAPS["video"])

    shows = cap_by_year(
        list(acc.shows.values()),
        lambda s: year_of(s["day"]),
        lambda s: s["score"] + s["descendants"] * 0.5,
        CAPS["showhn"],
    )
    classics = cap_by_year(
        list(acc.classics.values()),
        lambda s: year_of(s["day"]),
        lambda s: s["score"],
        CAPS["classic"],
    )
    papers = cap_by_year(
        list(acc.papers.values()),
        lambda s: year_of(s["day"]),
        lambda s: s["score"],
        CAPS["paper"],
    )
    oss = cap_by_year(
        list(acc.oss.values()),
        lambda s: year_of(s["day"]),
        lambda s: s["score"],
        CAPS["oss"],
    )
    polls = cap_by_year(
        list(acc.polls.values()),
        lambda s: year_of(s["day"]),
        lambda s: s["votes"] or s["score"],
        CAPS["poll"],
    )
    cursed = cap_by_year(
        list(acc.cursed.values()),
        lambda s: year_of(s["day"]),
        lambda s: s["descendants"],
        CAPS["cursed"],
    )

    books = []
    for slot in acc.books.values():
        if not title_ok(slot["title"]):
            continue
        readers = len(slot["authors"]) or len(slot["mentions"]) or 1
        heat = readers * 0.6 + slot["recs"] * 1.0
        if heat <= 0:
            continue
        books.append({**slot, "heat": heat, "readers": readers, "year": year_of(slot["first"])})
    books = cap_by_year(books, lambda b: b["year"], lambda b: b["heat"], CAPS["book"])

    comments = []
    for slot in acc.comments.values():
        heat = slot["n_kids"] * 1.3 + slot["story_score"] * 0.01
        if slot["legendary"]:
            heat += 100000
        comments.append({**slot, "heat": heat, "year": year_of(slot["day"])})
    comments = cap_by_year(comments, lambda c: c["year"], lambda c: c["heat"], CAPS["comment"])
    # The seeded Dropbox remark must survive the per-year cap.
    if not any(c["id"] == 9224 for c in comments) and 9224 in acc.comments:
        comments.append({**acc.comments[9224], "heat": acc.comments[9224]["n_kids"] * 1.3 + 100000, "year": year_of(acc.comments[9224]["day"])})

    days = list(acc.days.values())
    days = cap_by_year(days, lambda items: year_of(items[0]["time"]), lambda items: items[0]["score"], CAPS["timemachine"])

    cards: list[dict] = []

    for slot in books:
        for mention in slot["mentions"]:
            slot["title"] = prefer_quote(slot["title"], mention["text"])
        mentions = slot["mentions"]
        mentions.sort(key=lambda m: (m["recommend"], len(m["text"])), reverse=True)
        picked = []
        seen_by = set()
        for mention in mentions:
            if mention["by"] in seen_by and mention["by"]:
                continue
            if mention["text"]:
                picked.append(
                    {
                        "hn_id": mention["id"],
                        "by": mention["by"],
                        "text": mention["text"][:300],
                        "time": mention["time"],
                        "kind": "quote",
                    }
                )
                seen_by.add(mention["by"])
            if len(picked) == 3:
                break
        readers = slot["readers"]
        recs = slot["recs"]
        summary = f"Linked by {readers} {'person' if readers == 1 else 'people'} in the archive."
        if recs:
            summary += f" {recs} of those notes read as a recommendation."
        image = None
        isbn = slot.get("isbn")
        if isbn:
            image = f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg"
        cards.append(
            card(
                card_id=safe_id("book", slot["key"]),
                pool="book",
                sub_pool=None,
                title=slot["title"],
                subtitle=slot["source"],
                image_url=image,
                hn_item_ids=[m["hn_id"] for m in picked],
                primary_hn_id=picked[0]["hn_id"] if picked else 0,
                external_url=slot["url"],
                heat_score=round(slot["heat"], 3),
                mentions=readers,
                first_seen=slot["first"],
                last_seen=slot["last"],
                peak_seen=slot["first"],
                summary=summary,
                excerpts=picked,
                domain=domain_of(slot["url"]),
                extra={"gem_hint": False, "hot_score": 0, "descendants": 0},
            )
        )

    for slot in videos:
        hn_ids = slot["hn_ids"][:6]
        cards.append(
            card(
                card_id=safe_id("video", slot["vid"]),
                pool="video",
                sub_pool=None,
                title=slot["title"],
                subtitle="YouTube",
                image_url=f"https://i.ytimg.com/vi/{slot['vid']}/hqdefault.jpg",
                hn_item_ids=hn_ids,
                primary_hn_id=hn_ids[0] if hn_ids else 0,
                external_url=f"https://www.youtube.com/watch?v={slot['vid']}",
                heat_score=round(slot["heat"], 3),
                mentions=slot["mentions"],
                first_seen=slot["first"],
                last_seen=slot["last"],
                peak_seen=slot["peak"] or slot["first"],
                summary=f"Shared in {slot['threads']} {'thread' if slot['threads'] == 1 else 'threads'} with {int(slot['score'])} combined points.",
                excerpts=[],
                domain="youtube.com",
                extra={
                    "gem_hint": slot["threads"] <= 2 and slot["best_descendants"] < 80,
                    "hot_score": slot["best_score"],
                    "descendants": slot["best_descendants"],
                },
            )
        )

    for slot in shows:
        heat = slot["score"] + slot["descendants"] * 0.5
        host = domain_of(slot["url"]) or "Text post"
        cards.append(
            card(
                card_id=safe_id("show", slot["id"]),
                pool="showhn",
                sub_pool=None,
                title=slot["title"],
                subtitle=host,
                image_url=None,
                hn_item_ids=[slot["id"]],
                primary_hn_id=slot["id"],
                external_url=slot["url"],
                heat_score=round(heat, 3),
                mentions=slot["descendants"],
                first_seen=slot["day"],
                last_seen=slot["day"],
                peak_seen=slot["day"],
                summary=f"Shown in {year_of(slot['day'])} with {slot['score']} points and {slot['descendants']} comments.",
                excerpts=excerpt_from_post(slot),
                domain=domain_of(slot["url"]),
                extra={"gem_hint": False, "hot_score": slot["score"], "descendants": slot["descendants"]},
            )
        )

    for slot in comments:
        quote = scene_quote(slot["text"], slot["id"])
        story = slot["story_title"] or "a thread"
        cards.append(
            card(
                card_id=safe_id("cmt", slot["id"]),
                pool="comment",
                sub_pool=None,
                title=scene_title(slot["text"], slot["id"]),
                subtitle=f"{slot['by']} · {slot['day'][:7] if slot['day'] else ''}".strip(" ·"),
                image_url=None,
                hn_item_ids=[i for i in [slot["id"], slot["story_id"]] if i],
                primary_hn_id=slot["id"],
                external_url=slot["story_url"] if slot["story_url"].startswith("http") else "",
                heat_score=round(slot["heat"], 3),
                mentions=max(slot["n_kids"], 1 if slot["legendary"] else slot["n_kids"]),
                first_seen=slot["day"],
                last_seen=slot["day"],
                peak_seen=slot["day"],
                summary=f"A remark under “{story}” with {slot['n_kids']} direct replies. Comment points are not public in the archive, so heat follows replies and the thread score.",
                excerpts=[
                    {
                        "hn_id": slot["id"],
                        "by": slot["by"],
                        "text": quote,
                        "time": slot["day"],
                        "kind": "quote",
                    }
                ],
                domain="",
                extra={"gem_hint": False, "hot_score": 0, "descendants": slot["n_kids"], "legendary": slot["legendary"]},
            )
        )

    wild_inputs = []
    for slot in classics:
        wild_inputs.append(("classic", slot, slot["score"], None))
    for slot in papers:
        label = f"arXiv:{slot['arxiv']}" if slot.get("arxiv") else (domain_of(slot["url"]) or "Paper")
        wild_inputs.append(("paper", slot, slot["score"], label))
    for slot in oss:
        wild_inputs.append(("oss", slot, slot["score"], slot["repo"]))
    for slot in polls:
        wild_inputs.append(("poll", slot, slot["votes"] or slot["score"], f"{len(slot['options'])} choices"))
    for items in days:
        wild_inputs.append(("timemachine", items, items[0]["score"], None))

    classic_scores = [s["score"] for s in classics] or [0]
    classic_scores.sort()
    median_classic = classic_scores[len(classic_scores) // 2]
    for slot in cursed:
        # Keep the stamp spicy without letting flagged titles occupy the top of the pool.
        fake = dict(slot)
        fake["url"] = ""
        fake["descendants"] = slot["descendants"]
        fake["text"] = ""
        fake["score"] = median_classic * 0.45
        wild_inputs.append(("classic", fake, fake["score"], "Flagged title"))

    for sub, slot, heat, subtitle in wild_inputs:
        if sub == "timemachine":
            items = slot
            top = items[0]
            day = top["time"]
            headlines = [
                {
                    "hn_id": item["id"],
                    "by": "",
                    "text": item["title"][:180],
                    "time": day,
                    "kind": "headline",
                }
                for item in items[:8]
            ]
            cards.append(
                card(
                    card_id=safe_id("day", day.replace("-", "")),
                    pool="wild",
                    sub_pool="timemachine",
                    title=f"Front page · {pretty_day(day)}",
                    subtitle=top["title"][:90],
                    image_url=None,
                    hn_item_ids=[item["id"] for item in items[:8]],
                    primary_hn_id=top["id"],
                    external_url=top["url"] if str(top["url"]).startswith("http") else "",
                    heat_score=round(float(heat), 3),
                    mentions=top["score"],
                    first_seen=day,
                    last_seen=day,
                    peak_seen=day,
                    summary=f"Time machine for {pretty_day(day)}. The lead story scored {top['score']}.",
                    excerpts=headlines,
                    domain=domain_of(top["url"]),
                    extra={"gem_hint": False, "hot_score": top["score"], "descendants": top["descendants"], "cursed": False},
                )
            )
            continue
        cursed_flag = subtitle == "Flagged title"
        if sub == "poll":
            excerpts = [
                {
                    "hn_id": opt["id"],
                    "by": "",
                    "text": opt["text"][:180],
                    "time": slot["day"],
                    "kind": "option",
                }
                for opt in slot["options"][:5]
            ]
            summary = f"A community poll from {year_of(slot['day'])} with {slot['votes']} counted votes."
            title = slot["title"]
            external = ""
            primary = slot["id"]
            hn_ids = [slot["id"]] + [o["id"] for o in slot["options"][:5]]
            mentions = slot["votes"] or slot["descendants"]
            domain = ""
        else:
            excerpts = excerpt_from_post(slot)
            title = slot["title"]
            external = "" if cursed_flag else (slot.get("url") or "")
            primary = slot["id"]
            hn_ids = [slot["id"]]
            mentions = slot.get("descendants") or slot.get("score") or 0
            domain = "" if cursed_flag else domain_of(slot.get("url") or "")
            if sub == "classic":
                summary = f"A {year_of(slot['day'])} thread with {slot['score']} points."
                if cursed_flag:
                    summary = "Title only. The post was flagged, so the body is not reproduced."
            elif sub == "paper":
                summary = f"A paper that reached {slot['score']} points in {year_of(slot['day'])}."
            else:
                summary = f"A repository shared in {year_of(slot['day'])} with {slot['score']} points."
        sub_out = "classic" if cursed_flag else sub
        cards.append(
            card(
                card_id=safe_id(
                    "poll" if sub == "poll" else "gh" if sub == "oss" else "wild",
                    (slot.get("repo") or "").replace("/", "_") or slot.get("key") or slot["id"],
                ),
                pool="wild",
                sub_pool=sub_out,
                title=title,
                subtitle=subtitle or domain or "Forum thread",
                image_url=None,
                hn_item_ids=hn_ids,
                primary_hn_id=primary,
                external_url=external if str(external).startswith("http") else "",
                heat_score=round(float(heat), 3),
                mentions=int(mentions),
                first_seen=slot["day"],
                last_seen=slot["day"],
                peak_seen=slot["day"],
                summary=summary,
                excerpts=excerpts,
                domain=domain,
                extra={
                    "gem_hint": False,
                    "hot_score": 0 if cursed_flag else slot.get("score") or 0,
                    "descendants": slot.get("descendants") or 0,
                    "cursed": cursed_flag,
                },
            )
        )

    # Rarity inside each pool, then special stamps.
    by_pool: dict[str, list] = defaultdict(list)
    for c in cards:
        by_pool[c["pool"]].append(c)
    for pool_name, pool_cards in by_pool.items():
        if pool_name == "wild":
            # Votes, points, and front-page scores are different units. Scale inside
            # each sub-pool so a legendary poll does not occupy every UR slot.
            raw_heat = {c["card_id"]: c["heat_score"] for c in pool_cards}
            grouped: dict[str, list] = defaultdict(list)
            for c in pool_cards:
                grouped[c["sub_pool"] or "classic"].append(c)
            for group in grouped.values():
                vals = [c["heat_score"] for c in group]
                lo, hi = min(vals), max(vals)
                span = hi - lo or 1
                for c in group:
                    c["heat_score"] = (c["heat_score"] - lo) / span * 1000
            assign_rarity(pool_cards)
            for c in pool_cards:
                c["heat_score"] = raw_heat[c["card_id"]]
        else:
            assign_rarity(pool_cards)

    gem_cards: list[tuple[float, dict]] = []
    for pool_cards in by_pool.values():
        pct = heat_percentile(pool_cards)
        for c in pool_cards:
            tags = []
            if 2006 <= c["year"] <= 2008:
                tags.append("antique")
            if c["_extra"].get("cursed"):
                tags.append("cursed")
            if c["pool"] == "video" and c["_extra"].get("gem_hint") and pct[c["card_id"]] >= 0.55:
                gem_cards.append((pct[c["card_id"]], c))
            c["tags"] = tags

    gem_cards.sort(key=lambda item: item[0], reverse=True)
    for _, c in gem_cards[:18]:
        if "gem" not in c["tags"]:
            c["tags"].append("gem")

    newest = ""
    for c in cards:
        if c["last_seen"] and c["last_seen"] > newest:
            newest = c["last_seen"]
    hot_from = ""
    if newest:
        hot_from = (datetime.fromisoformat(newest) - timedelta(days=40)).date().isoformat()
    recent = [c for c in cards if c["last_seen"] >= hot_from and not c["_extra"].get("cursed")]
    recent.sort(key=lambda c: c["heat_score"], reverse=True)
    for c in recent[:12]:
        if "hot" not in c["tags"]:
            c["tags"].append("hot")

    # Hand-picked scene: the 2007 Dropbox FTP remark.
    for c in cards:
        if c["card_id"] == "cmt_9224":
            c["rarity"] = "UR"
            if "antique" not in c["tags"]:
                c["tags"].append("antique")
            c["summary"] = (
                "The 2007 remark that a file-sync app could be assembled, quite trivially, "
                "from an FTP account. Direct replies plus the thread score put it here; the archive does not publish comment points."
            )

    enrich_books(cards)

    for c in cards:
        c.pop("_extra", None)
        for ex in c["excerpts"]:
            if len(ex["text"]) > 300:
                ex["text"] = ex["text"][:299].rstrip() + "…"

    cards.sort(key=lambda c: (c["pool"], c["year"], -c["heat_score"], c["card_id"]))
    return cards


def prefer_quote(title: str, text: str) -> str:
    for quote in re.findall(r"[“\"]([^”\"]{8,100})[”\"]", text or ""):
        quote = WS_RE.sub(" ", quote).strip()
        if not title_ok(quote):
            continue
        if title.lower()[:5] == quote.lower()[:5] and len(quote) > len(title) + 4:
            return quote
    return title


def scene_title(text: str, ident: int) -> str:
    if ident == 9224:
        match = re.search(
            r"you can already build such a system yourself quite trivially by getting an FTP account[^.]*\.",
            text,
            re.I,
        )
        if match:
            title = match.group(0).strip()
            if title[0].islower():
                title = title[0].upper() + title[1:]
            return title if len(title) <= 140 else title[:137].rstrip() + "…"
    return first_sentence(text)


def scene_quote(text: str, ident: int) -> str:
    if ident == 9224:
        match = re.search(r"you can already build such a system yourself quite trivially", text, re.I)
        if match:
            return excerpt(text[match.start() :])
    return excerpt(text)


def enrich_books(cards: list[dict]) -> None:
    import urllib.request

    targets: list[tuple[dict, str]] = []
    for c in cards:
        if c["pool"] != "book":
            continue
        isbn = None
        if c.get("image_url") and "/isbn/" in c["image_url"]:
            isbn = c["image_url"].split("/isbn/")[1].split("-")[0]
        else:
            match = re.search(r"^book_az([0-9]{9}[0-9Xx])$", c["card_id"])
            if match:
                isbn = match.group(1).upper()
                c["image_url"] = f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg"
        if isbn:
            targets.append((c, isbn))
    if not targets:
        return
    log(f"looking up {len(targets)} book ISBNs")

    def lookup(isbn: str):
        url = f"https://openlibrary.org/search.json?isbn={isbn}&limit=1&fields=title,subtitle,author_name"
        try:
            with urllib.request.urlopen(url, timeout=12) as resp:
                payload = json.loads(resp.read().decode())
        except Exception:
            return None
        docs = payload.get("docs") or []
        if not docs:
            return None
        doc = docs[0]
        title = (doc.get("title") or "").strip()
        lowered = title.lower()
        if not title or "study guide" in lowered or lowered.startswith("summary"):
            return None
        subtitle = (doc.get("subtitle") or "").strip()
        authors = doc.get("author_name") or []
        full = f"{title}: {subtitle}" if subtitle else title
        if len(full) > 140:
            full = title
        return full, (authors[0] if authors else "")

    def shares_word(left: str, right: str) -> bool:
        words = {w.lower() for w in re.findall(r"[A-Za-z]{4,}", left)}
        other = {w.lower() for w in re.findall(r"[A-Za-z]{4,}", right)}
        if not words or not other:
            return True
        return bool(words & other)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(lookup, isbn): card for card, isbn in targets}
        hit = 0
        for future in as_completed(futures):
            card = futures[future]
            result = future.result()
            if not result:
                continue
            title, author = result
            if title_ok(title) and shares_word(card["title"], title):
                card["title"] = title
                hit += 1
            if author and card["subtitle"] in {"Amazon", "Goodreads", "Open Library", "Bookshop", "Google Books"}:
                card["subtitle"] = author
        log(f"renamed {hit} books from Open Library")


def excerpt_from_post(slot: dict) -> list[dict]:
    text = excerpt(slot.get("text") or "")
    if len(text) < 40:
        return []
    return [
        {
            "hn_id": slot["id"],
            "by": slot.get("author") or "",
            "text": text,
            "time": slot.get("day") or "",
            "kind": "quote",
        }
    ]


def pretty_day(day: str) -> str:
    try:
        dt = datetime.fromisoformat(day)
    except ValueError:
        return day
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def card(
    *,
    card_id: str,
    pool: str,
    sub_pool: str | None,
    title: str,
    subtitle: str,
    image_url: str | None,
    hn_item_ids: list[int],
    primary_hn_id: int,
    external_url: str,
    heat_score: float,
    mentions: int,
    first_seen: str,
    last_seen: str,
    peak_seen: str,
    summary: str,
    excerpts: list[dict],
    domain: str,
    extra: dict,
) -> dict:
    year = year_of(first_seen)
    return {
        "card_id": card_id,
        "pool": pool,
        "sub_pool": sub_pool,
        "title": title.strip(),
        "subtitle": (subtitle or "").strip(),
        "image_url": image_url,
        "hn_item_ids": [int(i) for i in hn_item_ids if i],
        "primary_hn_id": int(primary_hn_id or 0),
        "external_url": external_url or "",
        "heat_score": float(heat_score),
        "mentions": int(mentions or 0),
        "rarity": "C",
        "tags": [],
        "first_seen": first_seen or "",
        "last_seen": last_seen or first_seen or "",
        "peak_seen": peak_seen or first_seen or "",
        "year": year,
        "summary": summary,
        "excerpts": excerpts,
        "domain": domain or "",
        "_extra": extra,
    }


def validate(cards: list[dict], strict: bool = True) -> None:
    ids = [c["card_id"] for c in cards]
    if len(ids) != len(set(ids)):
        dupes = [i for i in ids if ids.count(i) > 1]
        raise SystemExit(f"duplicate card ids: {sorted(set(dupes))[:8]}")
    pools = defaultdict(int)
    rarities = defaultdict(lambda: defaultdict(int))
    subs = defaultdict(int)
    for c in cards:
        if c["pool"] not in {"book", "video", "showhn", "comment", "wild"}:
            raise SystemExit(f"bad pool {c['pool']}")
        if c["rarity"] not in {"C", "R", "SR", "SSR", "UR"}:
            raise SystemExit("bad rarity")
        if not c["title"] or not c["first_seen"]:
            raise SystemExit(f"incomplete card {c['card_id']}")
        for ex in c["excerpts"]:
            if len(ex["text"]) > 300:
                raise SystemExit(f"excerpt too long {c['card_id']}")
        pools[c["pool"]] += 1
        rarities[c["pool"]][c["rarity"]] += 1
        if c["sub_pool"]:
            subs[c["sub_pool"]] += 1
        if "cursed" in c["tags"] and c["external_url"]:
            raise SystemExit("cursed card leaked an external url")
    log("pools " + ", ".join(f"{k}={v}" for k, v in sorted(pools.items())))
    for pool, counts in sorted(rarities.items()):
        log(f"  {pool} " + " ".join(f"{r}:{counts[r]}" for r in ["C", "R", "SR", "SSR", "UR"]))
    log("wild subs " + ", ".join(f"{k}={v}" for k, v in sorted(subs.items())))
    for pool, n in pools.items():
        if n < 40:
            message = f"pool {pool} only has {n} cards"
            if strict:
                raise SystemExit(message)
            log("WARNING " + message)
    if not any(c["card_id"] == "cmt_9224" and c["rarity"] == "UR" for c in cards):
        message = "legendary comment cmt_9224 missing from this slice"
        if strict:
            raise SystemExit(message)
        log("WARNING: " + message)
    else:
        log("legendary cmt_9224 present as UR")


def prune_dead_thumbs(cards: list[dict]) -> None:
    """Drop YouTube thumbs that 404 so the card falls back to the typographic face."""
    import urllib.request

    targets = [c for c in cards if c.get("image_url") and "i.ytimg.com" in c["image_url"]]
    if not targets:
        return

    def alive(url: str) -> bool:
        request = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                response.read(32)
                return response.status == 200
        except Exception:
            return False

    dead = 0
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(alive, c["image_url"]): c for c in targets}
        for future in as_completed(futures):
            card = futures[future]
            if not future.result():
                card["image_url"] = None
                dead += 1
    log(f"cleared {dead} missing video thumbs of {len(targets)}")


def write_catalog(cards: list[dict], months: list[str], started: float) -> None:
    newest = max((c["last_seen"] for c in cards if c["last_seen"]), default="")
    pools = defaultdict(int)
    for c in cards:
        pools[c["pool"]] += 1
    payload = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE,
        "license": LICENSE,
        "months": sorted(set(months)),
        "newest_day": newest,
        "pool_counts": dict(pools),
        "card_count": len(cards),
        "notes": [
            "Heat and rarity are computed inside this static snapshot, then capped per year so older seasons stay in the deck.",
            "Comment points are not present in the archive. Scene heat uses direct replies x 1.3 plus thread score x 0.01. From 2024 the kids array is empty, so replies are counted from the parent column.",
            "Book cards come from Goodreads, Open Library, Bookshop, Google Books, and Amazon /dp/ links, merged by identifier.",
            "Gem is a proxy: a high-heat video with a short thread. YouTube view counts are not fetched.",
            "Hot marks strong items from the last 10 days of the snapshot, not a live front page.",
            "The 2007 FTP remark on the Dropbox thread (item 9224) is pinned to UR.",
        ],
        "cards": cards,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    for path in ("data/catalog.json", "public/data/catalog.json"):
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(raw)
        log(f"wrote {path} ({len(raw) / 1_000_000:.2f} MB, {len(cards)} cards, {time.time() - started:.0f}s)")


def sample_print(cards: list[dict]) -> None:
    for pool in ["book", "video", "showhn", "comment", "wild"]:
        log(f"--- {pool}")
        shown = [c for c in cards if c["pool"] == pool][:6]
        for c in shown:
            log(f"  [{c['rarity']}] {c['year']} {c['title'][:72]}  ({c['subtitle'][:40]})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the HackerPacks catalog from the HF archive.")
    parser.add_argument("--from", dest="start", default="2006-10")
    parser.add_argument("--to", dest="end", default="2026-08")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}", args.start) or not re.fullmatch(r"\d{4}-\d{2}", args.end):
        raise SystemExit("months must look like YYYY-MM")
    selected = months_between(args.start, args.end)
    log(f"scanning {len(selected)} months with {args.workers} workers")
    # Warm the extension once before threads race to install it.
    connect().close()
    started = time.time()
    acc = Accumulator()
    workers = max(1, args.workers)
    chunk = workers * 3
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for offset in range(0, len(selected), chunk):
            batch = selected[offset : offset + chunk]
            futures = {pool.submit(fetch_month, ym): ym for ym in batch}
            for future in as_completed(futures):
                part = future.result()
                acc.merge(part)
    log(f"merged {len(acc.months)} months in {time.time() - started:.0f}s")
    log(
        f"raw videos={len(acc.videos)} shows={len(acc.shows)} books={len(acc.books)} "
        f"comments={len(acc.comments)} classics={len(acc.classics)} papers={len(acc.papers)} "
        f"oss={len(acc.oss)} polls={len(acc.polls)} days={len(acc.days)} cursed={len(acc.cursed)}"
    )
    cards = build_cards(acc)
    prune_dead_thumbs(cards)
    sample_print(cards)
    validate(cards, strict=len(acc.months) >= 36)
    import os

    os.makedirs("data", exist_ok=True)
    os.makedirs("public/data", exist_ok=True)
    write_catalog(cards, acc.months, started)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
