import { useRef } from 'react';

import { ORDER_STATUSES } from '../../shared/orders';
import { ApiError } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';

// The style sample page at /styles, linked from nowhere in the menu: every
// shared style in one place, for anyone building a page to copy from and for
// checking the theme by eye. The rows and messages are made up.
const sampleError = new ApiError(
  409,
  'SAMPLE',
  'This is how a failed request looks',
  'req-sample',
);

export function StylesPage() {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div className="page-header">
        <h1>Styles</h1>
        <button type="button">Page action</button>
      </div>
      <p>
        Every shared style in one place. Body text sits on the page like this,
        with a <a href="#buttons">link</a> and some{' '}
        <span className="muted">muted text</span>.
      </p>

      <h2>Headings</h2>
      <h3>A third-level heading</h3>
      <p>Headings use the system serif fonts; everything else is sans-serif.</p>

      <h2 id="buttons">Buttons</h2>
      <div className="form-actions">
        <button type="button">Primary</button>
        <button type="button" className="button-secondary">
          Secondary
        </button>
        <button type="button" className="button-danger">
          Danger
        </button>
        <a className="button" href="#buttons">
          A link that looks like a button
        </a>
      </div>
      <h3>Disabled</h3>
      <div className="form-actions">
        <button type="button" disabled>
          Primary
        </button>
        <button type="button" className="button-secondary" disabled>
          Secondary
        </button>
        <button type="button" className="button-danger" disabled>
          Danger
        </button>
      </div>

      <h2>Form fields</h2>
      <form className="form card" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="sample-name">Test name</label>
          <input
            id="sample-name"
            defaultValue="Sample panel"
            aria-describedby="sample-name-help"
          />
          <p id="sample-name-help" className="field-help">
            The name the clinic sees.
          </p>
        </div>
        <div className="field">
          <label htmlFor="sample-code">Code</label>
          <input
            id="sample-code"
            defaultValue="!!"
            aria-invalid="true"
            aria-describedby="sample-code-help sample-code-error"
          />
          <p id="sample-code-help" className="field-help">
            Letters and digits, up to 12.
          </p>
          <p id="sample-code-error" className="field-error">
            Use letters and digits only.
          </p>
        </div>
        <div className="field">
          <label htmlFor="sample-locked">Locked code</label>
          <input
            id="sample-locked"
            defaultValue="SAMPLE1"
            disabled
            aria-describedby="sample-locked-help"
          />
          <p id="sample-locked-help" className="field-help">
            Code cannot be changed
          </p>
        </div>
        <div className="field">
          <label htmlFor="sample-kind">Kind</label>
          <select id="sample-kind" defaultValue="blood">
            <option value="blood">Blood</option>
            <option value="urine">Urine</option>
          </select>
        </div>
        <div className="form-actions">
          <button type="submit">Save</button>
          <button type="button" className="button-secondary">
            Cancel
          </button>
        </div>
      </form>

      <h2>Table</h2>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Name</th>
            <th scope="col">Status</th>
            <th scope="col" className="numeric">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SAMPLE1</td>
            <td>Sample panel one</td>
            <td>
              <StatusBadge status="ordered" />
            </td>
            <td className="numeric">$12.50</td>
          </tr>
          <tr>
            <td>SAMPLE2</td>
            <td>Sample panel two</td>
            <td>
              <StatusBadge status="completed" />
            </td>
            <td className="numeric">$140.00</td>
          </tr>
          <tr>
            <td>SAMPLE3</td>
            <td>Sample panel three</td>
            <td>
              <StatusBadge status="cancelled" />
            </td>
            <td className="numeric">$7.25</td>
          </tr>
        </tbody>
      </table>
      <p>
        An inactive row is dimmed with <code>className=&quot;muted&quot;</code>{' '}
        and says so in words; buttons in a cell sit in <code>row-actions</code>.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SAMPLE4</td>
            <td>Active</td>
            <td>
              <div className="row-actions">
                <button type="button" className="button-secondary">
                  Edit
                </button>
                <button type="button" className="button-secondary">
                  Deactivate
                </button>
              </div>
            </td>
          </tr>
          <tr className="muted">
            <td>SAMPLE5</td>
            <td>Inactive</td>
            <td>
              <div className="row-actions">
                <button type="button" className="button-secondary">
                  Edit
                </button>
                <button type="button" className="button-secondary">
                  Activate
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Status badges</h2>
      <div className="form-actions">
        {ORDER_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>

      <h2>Loading, empty and error</h2>
      <div className="stack">
        <Loading label="Loading samples…" />
        <EmptyState
          message="No samples yet."
          action={<button type="button">Add a sample</button>}
        />
        <ErrorMessage error={sampleError} onRetry={() => {}} />
      </div>

      <h2>Dialog and panel</h2>
      <div className="form-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => dialog.current?.showModal()}
        >
          Open a dialog
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => panel.current?.showModal()}
        >
          Open a panel
        </button>
      </div>
      <dialog ref={dialog} className="dialog" aria-labelledby="sample-dialog">
        <h2 id="sample-dialog">A dialog</h2>
        <p>A centred surface over a backdrop. Escape closes it.</p>
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </dialog>
      <dialog ref={panel} className="panel" aria-labelledby="sample-panel">
        <h2 id="sample-panel">A slide-out panel</h2>
        <p>Fills the right-hand side, full height. Escape closes it.</p>
        <button type="button" onClick={() => panel.current?.close()}>
          Close
        </button>
      </dialog>
    </>
  );
}
