/** Triggers a browser download for a Blob with the given filename. */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Download both `core` and `attempts` Excel exports in parallel and only
 * resolve once both downloads have been triggered.
 *
 * Used by the subject / topic / set delete flows: the user gets a local
 * copy of the same two files that get emailed to collaborators *before*
 * we fire the actual DELETE request. If the export fetch fails, the
 * deletion is aborted — collaborators-only emails would be the only
 * surviving copy of an irreversible delete, and the user explicitly
 * asked to never lose that local snapshot.
 */
export const downloadCoreAndAttempts = async (
  baseName: string,
  fetchBlob: (type: 'core' | 'attempts') => Promise<Blob>,
) => {
  const [coreBlob, attemptsBlob] = await Promise.all([
    fetchBlob('core'),
    fetchBlob('attempts'),
  ]);
  const safe = baseName.replace(/\s+/g, '_');
  const stamp = Date.now();
  downloadBlob(coreBlob,     `${safe}_core_${stamp}.xlsx`);
  downloadBlob(attemptsBlob, `${safe}_attempts_${stamp}.xlsx`);
};
