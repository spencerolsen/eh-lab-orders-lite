import { useState } from 'react';

import type { Patient } from '../../shared/patients';
import { NewOrderModal } from '../orders/NewOrderModal';
import { OrderDetailPanel, useOpenOrderId } from '../orders/OrderDetailPanel';
import { OrdersTable } from '../orders/OrdersTable';

// The patient's orders, newest first, under the patient form: the shared
// orders table narrowed to this patient, and the shared panel for the order
// in the address (?order=<id>), and "New order for this patient", which opens
// the New order modal with this patient chosen. Not shown on the create form.
export function PatientOrders({ patient }: { patient: Patient }) {
  const openOrderId = useOpenOrderId();
  const [placing, setPlacing] = useState(false);
  return (
    <section>
      <div className="page-header">
        <h2>Orders</h2>
        <button type="button" onClick={() => setPlacing(true)}>
          New order for this patient
        </button>
      </div>
      <OrdersTable filters={{ patientId: patient.id }} showPatient={false} />
      {openOrderId && <OrderDetailPanel orderId={openOrderId} />}
      {placing && (
        <NewOrderModal patient={patient} onClose={() => setPlacing(false)} />
      )}
    </section>
  );
}
