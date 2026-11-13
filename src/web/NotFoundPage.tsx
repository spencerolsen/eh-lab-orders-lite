import { Link } from 'react-router';

// Any path that matches no route.
export function NotFoundPage() {
  return (
    <>
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <Link to="/">Go to the orders page</Link>
    </>
  );
}
