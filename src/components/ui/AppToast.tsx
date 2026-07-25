interface AppToastProps {
  message: string | null;
}

/**
 * Formaliza a apresentação do sistema `notify(...)` já existente em `App.tsx`
 * (estado/timer preservados ali - este componente é só a marcação visual). Ver spec 13.
 */
export function AppToast({ message }: AppToastProps) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
