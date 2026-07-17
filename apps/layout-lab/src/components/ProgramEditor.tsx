export type ProgramError = {
  opIndex: number | null;
  message: string;
};

type ProgramEditorProps = {
  presetNames: readonly string[];
  selectedPreset: string;
  text: string;
  errors: readonly ProgramError[];
  onPresetChange: (name: string) => void;
  onTextChange: (text: string) => void;
  onRun: () => void;
};

export function ProgramEditor({
  presetNames,
  selectedPreset,
  text,
  errors,
  onPresetChange,
  onTextChange,
  onRun,
}: ProgramEditorProps) {
  return (
    <>
      <div className="preset-row">
        <select
          aria-label="Example program"
          value={selectedPreset}
          onChange={(event) => onPresetChange(event.currentTarget.value)}
        >
          {presetNames.map((name) => <option key={name}>{name}</option>)}
        </select>
        <button type="button" className="primary" onClick={onRun}>Run</button>
      </div>

      <h2 className="section-title">Layout program</h2>
      <textarea
        rows={16}
        spellCheck={false}
        aria-label="Layout program JSON"
        value={text}
        onChange={(event) => onTextChange(event.currentTarget.value)}
      />
      {errors.length > 0 ? (
        <div className="error-banner" role="alert" aria-live="polite">
          <strong>Program needs attention</strong>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error.opIndex ?? "json"}-${index}`}>
                {error.opIndex == null ? error.message : `op ${error.opIndex}: ${error.message}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
