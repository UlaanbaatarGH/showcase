import { useState } from 'react';

const SERVER_URL = 'http://localhost:3001';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function folderNameOf(folderPath) {
  return folderPath.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop() || '';
}

function parsePropertiesFile(content) {
  if (!content) return { note: null, props: [] };
  const lines = content.split('\n').filter((l) => l.length > 0);
  let note = null;
  const props = [];
  for (const line of lines) {
    if (line.startsWith('#:note:')) {
      note = line.slice('#:note:'.length).trim() || null;
      continue;
    }
    if (line.startsWith('#')) continue;
    const first = line.indexOf(':');
    if (first < 0) continue;
    const second = line.indexOf(':', first + 1);
    if (second < 0) continue;
    const id = parseInt(line.substring(0, first), 10);
    if (isNaN(id)) continue;
    props.push({
      id,
      label: line.substring(first + 1, second),
      value: line.substring(second + 1),
    });
  }
  return { note, props };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function readText(path) {
  try {
    const r = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(path)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.content ?? null;
  } catch {
    return null;
  }
}

async function publishFolder(folderPath, onProgress) {
  onProgress?.('Fetching current setup…');
  const cloud = await fetch('/api/showcase').then((r) => {
    if (!r.ok) throw new Error(`Cloud setup fetch failed: ${r.status}`);
    return r.json();
  });
  const cloudPropsByLabel = new Map();
  for (const p of cloud.properties ?? []) {
    cloudPropsByLabel.set((p.label || '').toLowerCase(), p.id);
  }

  onProgress?.('Reading folder metadata…');
  const listResp = await fetch(
    `${SERVER_URL}/agent/dir/list?path=${encodeURIComponent(folderPath)}`,
  );
  if (!listResp.ok) throw new Error('Could not list the folder.');
  const { entries = [] } = await listResp.json();

  const propsContent = await readText(folderPath + '/properties.txt');
  const { note: noteFromProps, props: localProps } =
    parsePropertiesFile(propsContent);

  let note = noteFromProps;
  if (!note) {
    const noteContent = await readText(folderPath + '/.note.txt');
    if (noteContent) note = noteContent.split('\n')[0].trim() || null;
  }

  const cloudFolderProperties = {};
  const unmappedLabels = [];
  for (const lp of localProps) {
    const cloudId = cloudPropsByLabel.get((lp.label || '').toLowerCase());
    if (cloudId != null) {
      if (lp.value != null && lp.value !== '') {
        cloudFolderProperties[String(cloudId)] = lp.value;
      }
    } else if (lp.label) {
      unmappedLabels.push(lp.label);
    }
  }

  const mainImageRaw = await readText(folderPath + '/.main-image.txt');
  const mainImageName = (mainImageRaw || '').trim() || null;

  const sortContent = await readText(folderPath + '/.sort.txt');
  const sortOrder = sortContent
    ? sortContent.split('\n').map((s) => s.trim()).filter(Boolean)
    : null;

  let imageNames = entries
    .filter((e) => e.type === 'file')
    .map((e) => e.name)
    .filter((name) => {
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      return IMAGE_EXTS.has(ext);
    });
  if (sortOrder && sortOrder.length > 0) {
    const orderMap = new Map(sortOrder.map((n, i) => [n, i]));
    imageNames = [...imageNames].sort((a, b) => {
      const ai = orderMap.has(a) ? orderMap.get(a) : Infinity;
      const bi = orderMap.has(b) ? orderMap.get(b) : Infinity;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
  }

  if (imageNames.length === 0) {
    throw new Error('No images in this folder — nothing to publish.');
  }

  const images = [];
  for (let i = 0; i < imageNames.length; i++) {
    const name = imageNames[i];
    onProgress?.(`Reading image ${i + 1}/${imageNames.length}: ${name}`);
    const imgPath = folderPath + '/' + name;
    const imgResp = await fetch(
      `${SERVER_URL}/agent/dir/image?path=${encodeURIComponent(imgPath)}`,
    );
    if (!imgResp.ok) throw new Error(`Could not read image ${name}`);
    const blob = await imgResp.blob();
    const dataBase64 = await blobToBase64(blob);

    let rotation = 0;
    const metaContent = await readText(imgPath + '.meta.json');
    if (metaContent) {
      try {
        rotation = JSON.parse(metaContent).rotation || 0;
      } catch {
        /* ignore malformed meta */
      }
    }

    images.push({
      filename: name,
      caption: name.replace(/\.[^.]+$/, ''),
      is_main: name === mainImageName,
      sort_order: i,
      rotation,
      data_base64: dataBase64,
    });
  }

  const payload = {
    folder: {
      name: folderNameOf(folderPath),
      note,
      sort_order: 0,
      properties: cloudFolderProperties,
    },
    images,
  };

  onProgress?.(`Uploading ${images.length} image(s) to the cloud…`);
  const resp = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body.error || body.detail || `Publish failed (${resp.status})`);
  }
  return { ...body, unmappedLabels };
}

export default function PublishButton({ folderPath }) {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    if (!folderPath) return;
    setStatus('publishing');
    setResult(null);
    setError(null);
    setMessage('Starting…');
    try {
      const r = await publishFolder(folderPath, setMessage);
      setStatus('done');
      setResult(r);
    } catch (e) {
      setStatus('error');
      setError(e.message || String(e));
    }
  };

  return (
    <div className="publish-box">
      <button
        type="button"
        className="publish-btn"
        onClick={handleClick}
        disabled={status === 'publishing' || !folderPath}
      >
        {status === 'publishing' ? 'Publishing…' : 'Publish to Showcase'}
      </button>
      {status === 'publishing' && message && (
        <div className="publish-progress">{message}</div>
      )}
      {status === 'done' && result && (
        <div className="publish-ok">
          Published folder #{result.folder_id} with {result.uploaded?.length ?? 0} image(s).
          {result.unmappedLabels?.length > 0 && (
            <div className="publish-warn">
              Ignored local properties not defined in cloud setup:{' '}
              {result.unmappedLabels.join(', ')}
            </div>
          )}
        </div>
      )}
      {status === 'error' && (
        <div className="publish-err">Publish failed: {error}</div>
      )}
    </div>
  );
}
