interface StateChangeLogProps {
  changes: string[];
}

export function StateChangeLog({ changes }: StateChangeLogProps) {
  return (
    <section className="panel">
      <div className="panelHeaderRow">
        <h2>Latest State Transitions</h2>
      </div>
      <ol className="changeList">
        {changes.map((change, index) => (
          <li key={`${change}-${index}`}>{change}</li>
        ))}
      </ol>
    </section>
  );
}
