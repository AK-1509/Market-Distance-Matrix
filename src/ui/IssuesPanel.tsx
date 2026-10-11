import type { Readiness } from '../domain/validation';

export function IssuesPanel({
  readiness,
  hasStaleView,
  onFixProduct,
  onEditProject,
}: {
  readiness: Readiness;
  hasStaleView: boolean;
  onFixProduct: (id: string) => void;
  onEditProject: () => void;
}) {
  const errors = readiness.issues.filter((i) => i.severity === 'error');
  const warnings = readiness.issues.filter((i) => i.severity === 'warning');
  if (!errors.length && !warnings.length) return null;
  const action = (i: Readiness['issues'][number]) =>
    i.productId ? (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFixProduct(i.productId!)}>
        Edit product
      </button>
    ) : i.field === 'tam' || i.field === 'union' || i.field === 'limits' ? (
      <button type="button" className="btn btn-ghost btn-sm" onClick={onEditProject}>
        Edit project
      </button>
    ) : null;
  return (
    <div className="issues">
      {errors.length > 0 && (
        <div className="alert alert-error" role="alert" data-testid="analysis-errors">
          <strong>The analysis is paused until these are fixed.</strong> Your draft is saved as entered{hasStaleView ? '; the charts below show the last valid analysis' : ''}.
          <ul>
            {errors.map((i, k) => (
              <li key={k}>
                {i.message} {action(i)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="alert alert-warn" data-testid="analysis-warnings">
          <ul>
            {warnings.map((i, k) => (
              <li key={k}>
                {i.message} {action(i)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
