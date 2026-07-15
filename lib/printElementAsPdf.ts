/**
 * Print an on-screen HTML subtree via a temporary window.
 * Choosing "Save as PDF" / "Microsoft Print to PDF" in the print dialog yields a
 * real text PDF (selectable + copyable), unlike html2canvas image PDFs.
 */
export async function printElementAsSelectablePdf(options: {
  element: HTMLElement;
  documentTitle: string;
}): Promise<void> {
  const { element, documentTitle } = options;
  const win = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
  if (!win) {
    throw new Error(
      "Pop-up blocked. Allow pop-ups for this site, then click Export PDF again.",
    );
  }

  const headParts: string[] = [];
  document.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
    headParts.push((node as HTMLLinkElement).outerHTML);
  });
  document.querySelectorAll("style").forEach((node) => {
    headParts.push(node.outerHTML);
  });

  const safeTitle = documentTitle.replace(/[<>&"]/g, "");

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
${headParts.join("\n")}
<style>
  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 12mm !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    html, body { padding: 8mm !important; }
    a[href]::after { content: none !important; }
  }
</style>
</head>
<body class="recheck-print-body">
${element.outerHTML}
</body>
</html>`);
  win.document.close();

  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    if (win.document.readyState === "complete") {
      window.setTimeout(finish, 350);
    } else {
      win.addEventListener("load", () => window.setTimeout(finish, 350), { once: true });
      window.setTimeout(finish, 1000);
    }
  });

  win.focus();

  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => {
        try {
          win.close();
        } catch {
          /* ignore */
        }
        resolve();
      }, 200);
    };
    win.addEventListener("afterprint", settle, { once: true });
    try {
      win.print();
    } catch (err) {
      settle();
      throw err;
    }
    // Some browsers never fire afterprint if the user cancels oddly — don't hang forever.
    window.setTimeout(settle, 120_000);
  });
}
