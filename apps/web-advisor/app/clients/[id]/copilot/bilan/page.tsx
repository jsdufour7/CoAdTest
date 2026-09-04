import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { ArrowLeft } from "lucide-react";

import { getLatestCopilotArtifact } from "@coadvisor/ai";
import { getClient } from "@coadvisor/crm";
import { Button, Logo } from "@coadvisor/ui";

import { requireAdvisorContext } from "../../../../../lib/advisor-context";
import { Markdown } from "../../../../../lib/markdown";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Bilan client" };

/**
 * Version imprimable du bilan client (Sprint 5 — FR-AI-001).
 * Page hors AppShell, pensée pour l'impression navigateur / PDF.
 */
export default async function BilanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { actor } = await requireAdvisorContext();
  const client = await getClient(actor, id);
  if (!client) {
    notFound();
  }
  const report = await getLatestCopilotArtifact(actor, id, "CLIENT_REPORT");
  if (!report) {
    redirect(`/clients/${id}/copilot`);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href={`/clients/${id}/copilot`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour au Copilot
            </Button>
          </Link>
          <div className="flex-1" />
          <p className="hidden text-xs text-slate-400 sm:block">
            Vérifiez le contenu avant de le remettre à votre client.
          </p>
          <PrintButton />
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-6 py-10 print:px-0 print:py-6">
        <header className="mb-8 flex items-center justify-between border-b border-slate-200 pb-6">
          <Logo size={30} />
          <p className="text-xs text-slate-400">
            Généré le{" "}
            {report.createdAt.toLocaleDateString("fr-CA", { dateStyle: "long" })}
          </p>
        </header>

        <Markdown text={report.content} />

        <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-400">
          <p>
            Provenance : {report.provider} ({report.model})
            {report.fellBack ? " — secours local" : ""} · CoAdvisor —
            Écosystème TwoDots.ca. Document d'assistance pour la discussion
            conseiller-client; il ne constitue pas un avis financier réglementé.
          </p>
        </footer>
      </main>
    </div>
  );
}
