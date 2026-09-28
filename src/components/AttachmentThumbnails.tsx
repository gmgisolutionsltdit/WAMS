interface Props {
  urls?: string[] | null;
}

/** Read-only thumbnail row for images already attached to a request. */
export const AttachmentThumbnails = ({ urls }: Props) => {
  if (!urls || urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {urls.map((u, i) => (
        <a key={i} href={u} target="_blank" rel="noopener noreferrer">
          <img src={u} alt={`Attachment ${i + 1}`} className="h-10 w-10 object-cover rounded border" />
        </a>
      ))}
    </div>
  );
};

export default AttachmentThumbnails;
