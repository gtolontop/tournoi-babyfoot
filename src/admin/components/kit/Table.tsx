import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../../lib/ui";

// A data table: columns, an optional row opening (onRow), an optional detail unfolding under the row (expand). On the
// phone the columns marked `phone: false` hide and the row keeps its first column and its figure. Styles: kit.css.

export type Column<R> = { key: string; label: ReactNode; cell: (r: R) => ReactNode; align?: "right"; phone?: boolean; width?: string };
export function DataTable<R>({ rows, columns, rowKey, onRow, expand, label, empty }: {
  rows: R[]; columns: Column<R>[]; rowKey: (r: R) => string; onRow?: (r: R) => void; expand?: (r: R) => ReactNode; label: string; empty?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <p className="k-feed-empty">{empty ?? "Aucune ligne."}</p>;
  return (
    <div className="k-table-wrap">
      <table className={cx("k-table", (onRow || expand) && "clickable")} aria-label={label}>
        <thead>
          <tr>
            {expand && <th className="k-table-toggle" aria-label="Détail" />}
            {columns.map((c) => <th key={c.key} className={cx(c.align, c.phone === false && "k-desk")} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            const isOpen = open === k;
            const act = () => (expand ? setOpen(isOpen ? null : k) : onRow?.(r));
            return (
              <Fragment key={k}>
                <tr className={cx(isOpen && "open")} onClick={(e) => !(e.target as HTMLElement).closest("a, button:not(.k-table-btn), input, select") && act()}>
                  {expand && (
                    <td className="k-table-toggle">
                      <button type="button" className="k-table-btn" aria-expanded={isOpen} aria-label={isOpen ? "Replier" : "Déplier"} onClick={(e) => (e.stopPropagation(), act())}>
                        <ChevronDown size={15} />
                      </button>
                    </td>
                  )}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx(c.align, c.phone === false && "k-desk")}>
                      {i === 0 && onRow && !expand ? <button type="button" className="k-table-open" onClick={(e) => (e.stopPropagation(), onRow(r))}>{c.cell(r)}</button> : c.cell(r)}
                    </td>
                  ))}
                </tr>
                {expand && isOpen && (
                  <tr className="k-table-detail">
                    <td colSpan={columns.length + 1}><div>{expand(r)}</div></td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
