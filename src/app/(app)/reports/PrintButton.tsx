"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="btn-secondary print:hidden">Print</button>;
}
