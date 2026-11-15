import { createRoot } from "react-dom/client";
import { useState } from "react";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { EnterpriseFinance } from "../../src/components/EnterpriseFinance";
import "../../src/styles.css";
function Fixture() {
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  return (
    <>
      <button onClick={() => setKind(kind === "receivable" ? "payable" : "receivable")}>
        Alternar pagar/receber
      </button>
      <EnterpriseFinance kind={kind} />
    </>
  );
}
const rootRoute = createRootRoute({ component: Fixture });
const router = createRouter({ routeTree: rootRoute });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
