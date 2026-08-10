"use client";
import { useRef, useState } from "react";

export default function Dropzone({
  onBytes,
}: {
  onBytes: (bytes: Uint8Array, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);

  const load = async (file: File) => {
    onBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  };

  return (
    <div
      className={`dropzone${dragover ? " dragover" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragover(false);
        const file = e.dataTransfer.files[0];
        if (file) void load(file);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.click(); }}
    >
      <p><strong>Drop a pool-swim .fit file here</strong></p>
      <p>or click to choose one. It never leaves your browser.</p>
      <input
        ref={inputRef}
        type="file"
        accept=".fit"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void load(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
