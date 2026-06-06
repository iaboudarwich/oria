"use client";

import { useState } from "react";
import {
  removeMember,
  setMemberSections,
  transferOwnership,
  updateMemberAccess,
} from "@/lib/data/member-access-actions";
import { ACCESS_LEVEL_BLURBS, ACCESS_LEVEL_LABELS } from "@/lib/data/access-labels";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/ui/icon";
import type { AccessLevel } from "@/lib/supabase/types";

type SectionOption = {
  ref: { kind: "builtin" | "custom"; key: string };
  name: string;
};

type Member = {
  id: string;
  access_level: AccessLevel;
  firstName: string;
};

export function ManageMemberPanel({
  member,
  sections,
  allowlist,
}: {
  member: Member;
  sections: SectionOption[];
  allowlist: Array<{ kind: "builtin" | "custom"; key: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<AccessLevel>(member.access_level);

  const allowedBuiltin = new Set(allowlist.filter((r) => r.kind === "builtin").map((r) => r.key));
  const allowedCustom = new Set(allowlist.filter((r) => r.kind === "custom").map((r) => r.key));

  return (
    <div className="rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`transition-base flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-[11.5px] hover:bg-canvas/60 ${
          open ? "text-ink" : "text-ink-muted hover:text-ink"
        }`}
      >
        <span className="flex-1 text-left">Manage access</span>
        {open ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
      </button>

      {open ? (
        <div className="space-y-4 border-t border-line px-3 py-3">
          <form
            action={async (formData) => {
              await updateMemberAccess(formData);
              setOpen(false);
            }}
            className="space-y-2"
          >
            <input type="hidden" name="membership_id" value={member.id} />
            <p className="text-[12px] text-ink-muted">What can {member.firstName} see?</p>
            <div className="space-y-1">
              {(["full", "limited", "assigned"] as AccessLevel[]).map((lvl) => (
                <label
                  key={lvl}
                  className="transition-base flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-canvas/60 px-2.5 py-1.5 hover:border-line-strong has-[:checked]:border-ink has-[:checked]:bg-canvas"
                >
                  <input
                    type="radio"
                    name="access_level"
                    value={lvl}
                    checked={level === lvl}
                    onChange={() => setLevel(lvl)}
                    className="mt-0.5 h-3.5 w-3.5 accent-ink"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] text-ink">{ACCESS_LEVEL_LABELS[lvl]}</span>
                    <span className="block text-[11px] text-ink-faint">
                      {ACCESS_LEVEL_BLURBS[lvl]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                className="transition-base inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft"
              >
                Save access
              </button>
              <form action={transferOwnership}>
                <input type="hidden" name="membership_id" value={member.id} />
                <button
                  type="submit"
                  className="transition-base text-[11.5px] text-ink-muted hover:text-ink"
                >
                  Make owner
                </button>
              </form>
              <form action={removeMember} className="ml-auto">
                <input type="hidden" name="membership_id" value={member.id} />
                <button
                  type="submit"
                  className="transition-base text-[11.5px] text-ink-faint hover:text-claret"
                >
                  Remove
                </button>
              </form>
            </div>
          </form>

          {level === "limited" ? (
            <form
              action={async (formData) => {
                await setMemberSections(formData);
                setOpen(false);
              }}
              className="space-y-2 border-t border-line pt-3"
            >
              <input type="hidden" name="membership_id" value={member.id} />
              <p className="text-[12px] text-ink-muted">Which sections can they see?</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {sections.map((s) => {
                  const checked =
                    s.ref.kind === "builtin"
                      ? allowedBuiltin.has(s.ref.key)
                      : allowedCustom.has(s.ref.key);
                  const inputName = s.ref.kind === "builtin" ? "builtin" : "custom";
                  return (
                    <label
                      key={`${s.ref.kind}-${s.ref.key}`}
                      className="transition-base flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-canvas/60 has-[:checked]:bg-canvas"
                    >
                      <input
                        type="checkbox"
                        name={inputName}
                        value={s.ref.key}
                        defaultChecked={checked}
                        className="h-3.5 w-3.5 accent-ink"
                      />
                      <span className="text-[12.5px] text-ink">{s.name}</span>
                    </label>
                  );
                })}
              </div>
              <button
                type="submit"
                className="transition-base mt-1 inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft"
              >
                Save sections
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
