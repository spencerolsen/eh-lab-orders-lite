import { OrderDetailPanel, useOpenOrderId } from '../orders/OrderDetailPanel';
import { OrdersTable } from '../orders/OrdersTable';

// The patient's orders, newest first, under the patient form: the shared
// orders table narrowed to this patient, and the shared panel for the order
// in the address (?order=<id>). Not shown on the create form.
export function PatientOrders({ patientId }: { patientId: string }) {
  const openOrderId = useOpenOrderId();
  return (
    <section>
      <h2>Orders</h2>
      <OrdersTable filters={{ patientId }} showPatient={false} />
      {openOrderId && <OrderDetailPanel orderId={openOrderId} />}
    </section>
  );
}
