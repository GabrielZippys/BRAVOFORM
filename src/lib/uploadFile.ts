/**
 * Upload simples de arquivos para o Firebase Storage.
 *
 * Usado pelo ExecutionFormStage no link público — o colaborador externo
 * (sem login) precisa anexar fotos via upload ou câmera.
 *
 * IMPORTANTE: as regras do Storage precisam permitir uploads para
 * `public-workflow/{token}/{instanceId}/...` sem auth.
 */

import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';

const MAX_FILE_BYTES = 10 * 1024 * 1024;        // 10MB por arquivo
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  url: string;
}

export async function uploadPublicFile(file: File, opts: {
  token: string;
  responseId: string;
  fieldId: string;
  onlyImages?: boolean;
}): Promise<UploadedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Arquivo "${file.name}" excede 10 MB`);
  }
  if (opts.onlyImages && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`Tipo de arquivo não suportado para imagens (${file.type})`);
  }

  // Sanitiza nome do arquivo
  const safeName = (file.name || 'arquivo')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  const path = `public-workflow/${opts.token.slice(0, 16)}/${opts.responseId}/${opts.fieldId}/${Date.now()}_${safeName}`;

  const r = storageRef(storage, path);
  const metadata = { contentType: file.type || 'application/octet-stream' };

  await uploadBytes(r, file, metadata);
  const url = await getDownloadURL(r);

  return {
    name: file.name,
    size: file.size,
    type: file.type,
    url,
  };
}
