/** Form-level error message, announced by assistive technology (role=alert). */
export function FormAlert({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"
    >
      {message}
    </p>
  );
}
