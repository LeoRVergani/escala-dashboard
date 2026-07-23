interface FlowStepsProps {
  current: 1 | 2 | 3;
  labels: [string, string, string];
}

export function FlowSteps({ current, labels }: FlowStepsProps) {
  return (
    <div className="flow-steps" aria-label="Progresso">
      <ol className="flow-steps__track" role="list">
        {labels.map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3;
          const complete = step < current;
          const currentStep = step === current;
          const stateClass = complete ? ' is-complete' : currentStep ? ' is-current' : '';

          return (
            <li
              key={`${step}-${label}`}
              className={`flow-steps__item${stateClass}`}
              aria-current={currentStep ? 'step' : undefined}
            >
              <span className="flow-steps__marker" aria-hidden="true">
                {complete ? '✓' : step}
              </span>
              <span className="flow-steps__label">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
