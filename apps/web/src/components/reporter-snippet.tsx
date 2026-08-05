import { CodeBlock } from "@dolshoe/ui/components/code-block";
import { Label } from "@dolshoe/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
import { useState } from "react";

/**
 * The code that turns a DSN into reports arriving.
 *
 * @remarks
 * It lived only in the README, which is one navigation and one context switch
 * away from the moment somebody actually needs it — right after issuing a
 * token, with the DSN still on the clipboard. Each runtime reads environment
 * variables its own way, so the snippet is per-runtime rather than one Node
 * example with a note about the others.
 *
 * The DSN is read from the environment rather than pasted into the snippet on
 * purpose: it is a live credential, and a snippet carrying one is a snippet
 * that ends up committed.
 */
const RUNTIMES = ["node", "deno", "bun", "python"] as const;

type Runtime = (typeof RUNTIMES)[number];

const RUNTIME_LABELS: Record<Runtime, string> = {
  node: "Node",
  deno: "Deno",
  bun: "Bun",
  python: "Python",
};

const SNIPPETS: Record<Runtime, string> = {
  node: `import * as Dolshoe from "@dolshoe/node";

Dolshoe.init({
  dsn: process.env.DOLSHOE_DSN,
  service: { name: "checkout-api", environment: "production" },
});

Dolshoe.captureException(new Error("Checkout failed"));`,
  deno: `import * as Dolshoe from "@dolshoe/deno";

Dolshoe.init({
  dsn: Deno.env.get("DOLSHOE_DSN"),
  service: { name: "checkout-api", environment: "production" },
});

Dolshoe.captureException(new Error("Checkout failed"));`,
  bun: `import * as Dolshoe from "@dolshoe/bun";

Dolshoe.init({
  dsn: Bun.env.DOLSHOE_DSN,
  service: { name: "checkout-api", environment: "production" },
});

Dolshoe.captureException(new Error("Checkout failed"));`,
  python: `import os

import dolshoe

dolshoe.init(
    dsn=os.environ["DOLSHOE_DSN"],
    service={"name": "checkout-api", "environment": "production"},
)

dolshoe.capture_exception(RuntimeError("Checkout failed"))`,
};

export function ReporterSnippet({ className }: Readonly<{ className?: string }>) {
  const [runtime, setRuntime] = useState<Runtime>("node");

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Put the DSN in <code className="font-mono text-[11px]">DOLSHOE_DSN</code>, then initialise
          the reporter once, as early in start-up as you can.
        </p>

        <div className="flex items-center gap-2">
          <Label className="sr-only" htmlFor="reporter-runtime">
            Runtime
          </Label>
          <Select onValueChange={(value) => setRuntime(value as Runtime)} value={runtime}>
            <SelectTrigger
              aria-label="Runtime"
              className="w-[130px]"
              id="reporter-runtime"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUNTIMES.map((option) => (
                <SelectItem key={option} value={option}>
                  {RUNTIME_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CodeBlock className="mt-3" value={SNIPPETS[runtime]} />

      {/*
        Worded for all four runtimes at once. Each hooks whatever its own
        language calls an unhandled failure — a rejected promise, an excepthook
        — and naming any one of them would be wrong on the other three.
      */}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Once <code className="font-mono">init</code> has run, a crash is captured without another
        call; the last line above is only there to prove the wiring works. Logs and spans travel
        over the same DSN.
      </p>
    </div>
  );
}
