import type { ReactNode } from "react";

/**
 * Mini-rendu Markdown SÛR (Sprint 5) — construit uniquement des
 * éléments React (jamais de dangerouslySetInnerHTML) : tout contenu,
 * y compris celui retourné par un LLM, est auto-échappé par React.
 *
 * Supporté (suffisant pour les artefacts Copilot) :
 *   # ## ### titres · listes « - » et « 1. » · **gras** · _italique_
 *   > citation · --- séparateur · paragraphes
 */

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Découpe sur **gras** puis _italique_ (ordre important).
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  boldParts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push(
        <strong key={`b${i}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>,
      );
      return;
    }
    const italicParts = part.split(/(_[^_]+_)/g);
    italicParts.forEach((sub, j) => {
      if (sub.startsWith("_") && sub.endsWith("_") && sub.length > 2) {
        nodes.push(
          <em key={`i${i}-${j}`} className="text-slate-500">
            {sub.slice(1, -1)}
          </em>,
        );
      } else if (sub !== "") {
        nodes.push(sub);
      }
    });
  });
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={key} className="text-sm leading-relaxed text-slate-700">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };
  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => (
      <li key={i} className="text-sm leading-relaxed text-slate-700">
        {renderInline(item)}
      </li>
    ));
    blocks.push(
      listType === "ul" ? (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ) : (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ),
    );
    listItems = [];
    listType = null;
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = `l${index}`;

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(key);
      flushList(key);
      const level = heading[1]!.length;
      const content = renderInline(heading[2]!);
      if (level === 1) {
        blocks.push(
          <h2 key={key} className="text-lg font-bold tracking-tight text-slate-900">
            {content}
          </h2>,
        );
      } else if (level === 2) {
        blocks.push(
          <h3 key={key} className="text-base font-semibold tracking-tight text-slate-900">
            {content}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={key} className="text-sm font-semibold text-slate-800">
            {content}
          </h4>,
        );
      }
      return;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph(key);
      flushList(key);
      blocks.push(<hr key={key} className="border-slate-200" />);
      return;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph(key);
      flushList(key);
      blocks.push(
        <blockquote
          key={key}
          className="border-l-2 border-brand-200 bg-brand-50/40 px-3 py-2 text-xs leading-relaxed text-slate-600"
        >
          {renderInline(quote[1]!)}
        </blockquote>,
      );
      return;
    }

    const unordered = line.match(/^[-•]\s+(.*)$/);
    const ordered = line.match(/^\d+[.)]\s+(.*)$/);
    if (unordered || ordered) {
      flushParagraph(key);
      const wanted = unordered ? "ul" : "ol";
      if (listType !== wanted) {
        flushList(key);
        listType = wanted;
      }
      listItems.push((unordered?.[1] ?? ordered?.[1])!);
      return;
    }

    if (line.trim() === "") {
      flushParagraph(key);
      flushList(key);
      return;
    }

    flushList(key);
    paragraph.push(line.trim());
  });

  flushParagraph("end");
  flushList("end");

  return <div className="space-y-2.5">{blocks}</div>;
}
