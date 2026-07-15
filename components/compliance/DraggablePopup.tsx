'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Move } from 'lucide-react';

interface DraggablePopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/** A movable popup with no backdrop/blur — the page behind stays fully visible and interactive. */
export default function DraggablePopup({ isOpen, onClose, title, children }: DraggablePopupProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    if (isOpen) setOffset({ x: 0, y: 0 });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const startDrag = (e: React.MouseEvent) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setOffset({
        x: dragState.current.origX + (ev.clientX - dragState.current.startX),
        y: dragState.current.origY + (ev.clientY - dragState.current.startY),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none">
      <div
        style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
        className="pointer-events-auto absolute top-1/2 left-1/2 w-[min(32rem,90vw)] max-h-[70vh] flex flex-col bg-white rounded-xl shadow-2xl border border-gray-300"
      >
        <div
          onMouseDown={startDrag}
          className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 rounded-t-xl bg-gray-50 cursor-move select-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Move className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-xs font-black text-gray-700 uppercase tracking-wide truncate">{title}</span>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
