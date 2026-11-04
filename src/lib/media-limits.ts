// One cap for post media (images and video) that is buffered in memory:
// direct uploads, remote media fetches and scheduled-media reads.
// The production container has no hard memory cap on a shared 12 GB host and
// each upload is held roughly 3-4x (middleware body clone, parsed File,
// ArrayBuffer, R2 request body), so 100 MB keeps a single upload near 400 MB.
// Raising this to X's 512 MB video ceiling needs a direct-to-R2 upload first.
export const MAX_MEDIA_MB = 100;
export const MAX_MEDIA_BYTES = MAX_MEDIA_MB * 1024 * 1024;
