function UsageTable({ events = [] }) {
  return (
    <section className="settings-block">
      <h4>Recent Usage (Placeholder)</h4>
      <div className="settings-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Symbol</th>
              <th>Input</th>
              <th>Output</th>
              <th>Total</th>
              <th>Cost (USD)</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan="6">No usage events available.</td>
              </tr>
            ) : (
              events.map((event, index) => (
                <tr key={`${event.timestamp}-${index}`}>
                  <td>{event.timestamp}</td>
                  <td>{event.symbol || "-"}</td>
                  <td>{event.inputTokens ?? 0}</td>
                  <td>{event.outputTokens ?? 0}</td>
                  <td>{event.totalTokens ?? 0}</td>
                  <td>{Number(event.cost ?? 0).toFixed(5)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default UsageTable;
