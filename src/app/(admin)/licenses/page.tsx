import { Check, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const INCLUDED = [
  "Every mailbox, folder, filter and routing feature",
  "Shared inboxes, delegated access and multiple user accounts",
  "Custom branding, signatures and email forwarding",
  "The built-in assistant, MCP endpoint and API keys",
];

export default function LicensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium text-neutral-900">Licensing</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This install is self-hosted and unlicensed: nothing is purchased, and
          nothing is checked against a licensing server.
        </p>
      </div>
      <Card className="rounded-3xl border-0 bg-white p-6">
        <CardHeader className="space-y-4 py-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <CardTitle>All features enabled</CardTitle>
          <CardDescription>
            Upstream restricts account management, branding and forwarding behind
            Pro/Team keys validated against a third-party service. Those checks
            always pass here, so every feature is available and no key, hash or
            installation identifier is stored or transmitted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          {INCLUDED.map((feature) => (
            <p key={feature} className="flex gap-2 text-sm text-neutral-600">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              {feature}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
