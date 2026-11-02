"use client";

import { useState } from "react";
import { REMOVAL_EMAIL } from "../lib/content";
import { Button } from "./Button";

export function RemovalForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const card = String(form.get("card") || "").trim();
    const email = String(form.get("email") || "").trim();
    const reason = String(form.get("reason") || "").trim();
    if (card.length < 3 || reason.length < 8) {
      setStatus("error");
      setMessage("Add the card link and a short reason so a person can find it.");
      return;
    }
    if (email && !email.includes("@")) {
      setStatus("error");
      setMessage("That email doesn't look usable.");
      return;
    }
    setStatus("loading");
    const body = `Card: ${card}\nContact: ${email || "not given"}\n\n${reason}\n`;
    const href = `mailto:${REMOVAL_EMAIL}?subject=${encodeURIComponent("HackerPacks removal request")}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setStatus("success");
    setMessage("Your mail app should open with the request. This static build does not store the form.");
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3" noValidate>
      <label className="grid gap-1 text-sm">
        Card link or id
        <input className="field" name="card" required placeholder="https://…/card/cmt_9224" />
      </label>
      <label className="grid gap-1 text-sm">
        Email, if you want a reply
        <input className="field" name="email" type="email" placeholder="you@example.com" />
      </label>
      <label className="grid gap-1 text-sm">
        What should come down
        <textarea className="field min-h-28" name="reason" required placeholder="This comment is mine, please remove the card." />
      </label>
      <div>
        <Button type="submit" status={status} successLabel="Mail draft ready">
          Write the request
        </Button>
      </div>
      {message ? <p className={status === "error" ? "text-[#ffb4a8]" : "text-mute"}>{message}</p> : null}
      <p className="text-sm text-mute">
        Sends nothing to a server. It opens a draft to {REMOVAL_EMAIL}. Swap that address before a public launch. The aim is a reply within 48 hours.
      </p>
    </form>
  );
}
