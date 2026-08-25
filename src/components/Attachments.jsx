import { useEffect, useRef, useState } from 'react';
import { repository } from '../data/repository.js';
import { ACCEPT } from '../data/files.js';

const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;

/** One attachment thumbnail. Object URLs are revoked when it unmounts. */
function Thumb({ meta, onRemove }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let revoke = null;
    let cancelled = false;
    repository.getAttachmentUrl(meta.id).then((u) => {
      if (cancelled) {
        if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
        return;
      }
      setUrl(u);
      if (u?.startsWith('blob:')) revoke = u;
    });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [meta.id]);

  const isImage = meta.type?.startsWith('image/');

  return (
    <li className="proof__item">
      <a href={url || undefined} target="_blank" rel="noreferrer" className="proof__link" title={meta.name}>
        {isImage && url ? (
          <img src={url} alt={meta.name} className="proof__img" />
        ) : (
          <span className="proof__file" aria-hidden="true">
            DOC
          </span>
        )}
      </a>
      <span className="proof__meta">
        <span className="proof__name">{meta.name}</span>
        <span className="proof__size num">{kb(meta.size)}</span>
      </span>
      <button
        type="button"
        className="ghost danger proof__remove"
        onClick={() => onRemove(meta.id)}
        aria-label={`Remove attachment ${meta.name}`}
      >
        ×
      </button>
    </li>
  );
}

/**
 * Evidence for one shift: screenshots of the gig posting, the schedule, texts,
 * a pay stub. Signed out, files never leave this browser; signed in, they go to
 * a PRIVATE storage bucket only you can read, and a local copy is always kept so
 * the evidence survives an upload failure. Every file is validated by magic
 * bytes first — see data/files.js.
 */
export default function Attachments({ shift, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (fileList) => {
    setBusy(true);
    setError('');
    const rejected = [];
    for (const file of Array.from(fileList || [])) {
      try {
        await onAdd(shift.id, file);
      } catch (err) {
        rejected.push(err.message);
      }
    }
    setError(rejected.join(' '));
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="proof">
      <div className="proof__head">
        <h4>Proof on file</h4>
        <button type="button" className="ghost linkish" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Adding…' : '+ Add screenshot or photo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="visually-hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      {shift.attachments?.length ? (
        <ul className="proof__list">
          {shift.attachments.map((a) => (
            <Thumb key={a.id} meta={a} onRemove={(id) => onRemove(shift.id, id)} />
          ))}
        </ul>
      ) : (
        <p className="proof__empty">
          Nothing attached. Screenshot the shift confirmation, the schedule, and any pay stub — a dated
          record you kept yourself is what makes a short payment arguable. Photos and PDFs only.
        </p>
      )}
    </div>
  );
}
