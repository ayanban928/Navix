import type { ExpenseItem } from "@/lib/types";

interface ExpensesPanelProps {
  expenses: ExpenseItem[];
}

export function ExpensesPanel({ expenses }: ExpensesPanelProps) {
  return (
    <section className="panel">
      <div className="panelHeaderRow">
        <h2>Expense Ledger</h2>
      </div>
      <ul className="ledgerList">
        {expenses.map((expense) => (
          <li key={expense.id}>
            <div>
              <p>{expense.label}</p>
              <small>{expense.category}</small>
            </div>
            <div className="expenseMeta">
              <strong>${expense.amount}</strong>
              <span className={`statusPill ${expense.status}`}>{expense.status}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
