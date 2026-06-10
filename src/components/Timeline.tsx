import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Keyframe, Bookmark } from '../store/types';

const TRACK_LEFT = 40;
const TRACK_RIGHT = 16;
const FIELD_TRACK_HEIGHT = 24;
const ANNOTATION_TRACK_HEIGHT = 20;
const SEPARATOR_HEIGHT = 1;
const BOOKMARK_STRIP_HEIGHT = 12;
const TICK_HEIGHT = 6;
const SPEEDS = [0.25, 0.5, 1, 2, 4];

let _recKfId = 1;
function recGenId() { return `rkf_${_recKfId++}_${Date.now()}`; }

let _bookmarkId = 1;
function genBookmarkId() { return `bm_${_bookmarkId++}_${Date.now()}`; }

export function Timeline() {
  const duration = useAppStore((s) => s.timelineDuration);
  const currentTime = useAppStore((s) => s.timelineCurrentTime);
  const recording = useAppStore((s) => s.timelineRecording);
  const playing = useAppStore((s) => s.timelinePlaying);
  const keyframes = useAppStore((s) => s.timelineKeyframes);
  const annotations = useAppStore((s) => s.annotations);
  const annotationKeyframes = useAppStore((s) => s.annotationKeyframes);
  const playbackSpeed = useAppStore((s) => s.timelinePlaybackSpeed);
  const loopRegion = useAppStore((s) => s.timelineLoopRegion);
  const selectedKeyframeIds = useAppStore((s) => s.selectedKeyframeIds);
  const bookmarks = useAppStore((s) => s.bookmarks);

  const setDuration = useAppStore((s) => s.setTimelineDuration);
  const setCurrentTime = useAppStore((s) => s.setTimelineCurrentTime);
  const setRecording = useAppStore((s) => s.setTimelineRecording);
  const setPlaying = useAppStore((s) => s.setTimelinePlaying);
  const setPlaybackSpeed = useAppStore((s) => s.setTimelinePlaybackSpeed);
  const setLoopRegion = useAppStore((s) => s.setTimelineLoopRegion);
  const setSelectedKeyframeIds = useAppStore((s) => s.setSelectedKeyframeIds);
  const addTimelineKeyframe = useAppStore((s) => s.addTimelineKeyframe);
  const removeTimelineKeyframe = useAppStore((s) => s.removeTimelineKeyframe);
  const moveTimelineKeyframe = useAppStore((s) => s.moveTimelineKeyframe);
  const moveTimelineKeyframes = useAppStore((s) => s.moveTimelineKeyframes);
  const insertManualKeyframe = useAppStore((s) => s.insertManualKeyframe);
  const captureFieldSnapshot = useAppStore((s) => s.captureFieldSnapshot);
  const interpolateAndRestore = useAppStore((s) => s.interpolateAndRestore);
  const updateAnnotation = useAppStore((s) => s.updateAnnotation);
  const addBookmark = useAppStore((s) => s.addBookmark);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const renameBookmark = useAppStore((s) => s.renameBookmark);

  const containerRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(200);
  const [viewStart, setViewStart] = useState(0);
  const [viewEndRaw, setViewEndRaw] = useState(duration);
  const viewEnd = Math.min(viewEndRaw, duration);
  const dragRef = useRef<'playhead' | 'keyframe' | 'duration' | 'pan' | 'box-select' | 'loop' | 'selected-keyframes' | null>(null);
  const dragKfIdRef = useRef<string | null>(null);
  const panStartRef = useRef<{ clientX: number; viewStart: number; viewEnd: number } | null>(null);
  const boxSelectRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const loopDragRef = useRef<{ edge: 'start' | 'end'; initialRegion: { start: number; end: number } } | null>(null);
  const selectedDragRef = useRef<{ initialTimes: Record<string, number>; startClientX: number } | null>(null);
  const recordingTimerRef = useRef<number>(0);
  const lastRecordTimeRef = useRef<number>(0);
  const playStartRef = useRef<{ time: number; startMs: number } | null>(null);
  const animFrameRef = useRef<number>(0);
  const [renamingBookmarkId, setRenamingBookmarkId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [boxSelectVisual, setBoxSelectVisual] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setTrackWidth(containerRef.current.clientWidth - TRACK_LEFT - TRACK_RIGHT);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const viewDuration = viewEnd - viewStart;

  const timeToX = useCallback((t: number) => {
    return TRACK_LEFT + ((t - viewStart) / viewDuration) * trackWidth;
  }, [viewStart, viewDuration, trackWidth]);

  const xToTime = useCallback((x: number) => {
    const t = viewStart + ((x - TRACK_LEFT) / trackWidth) * viewDuration;
    return Math.max(0, Math.min(duration, t));
  }, [viewStart, viewDuration, trackWidth, duration]);

  useEffect(() => {
    if (!playing) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      playStartRef.current = null;
      return;
    }
    if (keyframes.length === 0) {
      setPlaying(false);
      return;
    }
    const startState = { time: currentTime, startMs: performance.now() };
    playStartRef.current = startState;
    const maxT = keyframes[keyframes.length - 1].time;
    const loop = () => {
      const start = playStartRef.current;
      if (!start) return;
      const elapsed = ((performance.now() - start.startMs) / 1000) * playbackSpeed;
      let t = start.time + elapsed;
      const effectiveLoop = loopRegion ?? null;
      const loopEnd = effectiveLoop ? effectiveLoop.end : maxT;
      if (t >= loopEnd) {
        if (effectiveLoop) {
          t = effectiveLoop.start + ((t - effectiveLoop.start) % (effectiveLoop.end - effectiveLoop.start));
          const newStart = { time: t - elapsed / playbackSpeed, startMs: performance.now() };
          playStartRef.current = newStart;
        } else {
          t = maxT;
          setPlaying(false);
        }
      }
      setCurrentTime(t);
      interpolateAndRestore(t);
      if (playing) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, keyframes, currentTime, playbackSpeed, loopRegion, setPlaying, setCurrentTime, interpolateAndRestore]);

  useEffect(() => {
    if (!recording) {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = 0;
      return;
    }
    lastRecordTimeRef.current = 0;
    const interval = 1000 / 15;
    recordingTimerRef.current = window.setInterval(() => {
      const state = useAppStore.getState();
      if (!state.timelineRecording) return;
      const snap = captureFieldSnapshot();
      const kf: Keyframe = {
        id: recGenId(),
        time: state.timelineCurrentTime,
        fieldSnapshot: snap,
      };
      addTimelineKeyframe(kf);
      const nextTime = state.timelineCurrentTime + interval / 1000;
      if (nextTime >= duration) {
        setRecording(false);
        setCurrentTime(duration);
        return;
      }
      setCurrentTime(nextTime);
    }, interval);
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [recording, duration, captureFieldSnapshot, addTimelineKeyframe, setRecording, setCurrentTime]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseTime = xToTime(mouseX);
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const minView = 2;
    const maxView = duration;
    let newViewDuration = viewDuration * factor;
    newViewDuration = Math.max(minView, Math.min(maxView, newViewDuration));
    const ratio = (mouseX - TRACK_LEFT) / trackWidth;
    let newStart = mouseTime - ratio * newViewDuration;
    let newEnd = newStart + newViewDuration;
    if (newStart < 0) { newStart = 0; newEnd = newViewDuration; }
    if (newEnd > duration) { newEnd = duration; newStart = duration - newViewDuration; }
    if (newStart < 0) newStart = 0;
    setViewStart(newStart);
    setViewEndRaw(newEnd);
  }, [xToTime, viewDuration, trackWidth, duration]);

  const getTrackYPositions = useCallback(() => {
    const fieldTrackY = BOOKMARK_STRIP_HEIGHT + 2;
    const separatorY = fieldTrackY + FIELD_TRACK_HEIGHT;
    const annTrackY = separatorY + SEPARATOR_HEIGHT;
    return { fieldTrackY, separatorY, annTrackY };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { fieldTrackY, annTrackY } = getTrackYPositions();

    if (e.button === 1) {
      e.preventDefault();
      dragRef.current = 'pan';
      panStartRef.current = { clientX: e.clientX, viewStart, viewEnd };
      return;
    }

    const resizeHandleX = TRACK_LEFT + trackWidth;
    if (Math.abs(x - resizeHandleX) < 8 && y >= fieldTrackY && y <= fieldTrackY + FIELD_TRACK_HEIGHT) {
      dragRef.current = 'duration';
      e.preventDefault();
      return;
    }

    const phX = timeToX(currentTime);
    if (Math.abs(x - phX) < 6 && y >= BOOKMARK_STRIP_HEIGHT && y <= annTrackY + ANNOTATION_TRACK_HEIGHT) {
      dragRef.current = 'playhead';
      setPlaying(false);
      e.preventDefault();
      return;
    }

    if (e.shiftKey && y >= fieldTrackY && y <= fieldTrackY + FIELD_TRACK_HEIGHT && x >= TRACK_LEFT && x <= TRACK_LEFT + trackWidth) {
      dragRef.current = 'box-select';
      boxSelectRef.current = { startX: x, startY: y, currentX: x, currentY: y };
      e.preventDefault();
      return;
    }

    if (y >= fieldTrackY && y <= fieldTrackY + FIELD_TRACK_HEIGHT) {
      for (const kf of keyframes) {
        const kfX = timeToX(kf.time);
        if (Math.abs(x - kfX) < 6) {
          if (selectedKeyframeIds.includes(kf.id)) {
            dragRef.current = 'selected-keyframes';
            const initialTimes: Record<string, number> = {};
            for (const sid of selectedKeyframeIds) {
              const skf = keyframes.find((k) => k.id === sid);
              if (skf) initialTimes[sid] = skf.time;
            }
            selectedDragRef.current = { initialTimes, startClientX: e.clientX };
          } else {
            dragRef.current = 'keyframe';
            dragKfIdRef.current = kf.id;
            setSelectedKeyframeIds([kf.id]);
          }
          e.preventDefault();
          return;
        }
      }
    }

    if (y >= annTrackY && y <= annTrackY + ANNOTATION_TRACK_HEIGHT) {
      const annBarY = annTrackY + 2;
      for (const ann of annotations) {
        if (ann.timeStart === null || ann.timeEnd === null) continue;
        const sx = timeToX(ann.timeStart);
        const ex = timeToX(ann.timeEnd);
        if (x >= sx && x <= ex && y >= annBarY && y <= annBarY + ANNOTATION_TRACK_HEIGHT - 4) {
          return;
        }
      }
    }

    if (x >= TRACK_LEFT && x <= TRACK_LEFT + trackWidth && y >= BOOKMARK_STRIP_HEIGHT && y <= annTrackY + ANNOTATION_TRACK_HEIGHT) {
      const t = xToTime(x);
      setCurrentTime(t);
      if (keyframes.length > 0) interpolateAndRestore(t);
      dragRef.current = 'playhead';
      e.preventDefault();
    }
  }, [currentTime, keyframes, timeToX, xToTime, trackWidth, viewStart, viewEnd, selectedKeyframeIds, annotations, setPlaying, setCurrentTime, interpolateAndRestore, setSelectedKeyframeIds, getTrackYPositions]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;

    if (dragRef.current === 'playhead') {
      const t = xToTime(x);
      setCurrentTime(t);
      if (keyframes.length > 0) interpolateAndRestore(t);
    } else if (dragRef.current === 'keyframe' && dragKfIdRef.current) {
      const t = xToTime(x);
      moveTimelineKeyframe(dragKfIdRef.current, t);
    } else if (dragRef.current === 'duration') {
      const newDur = Math.max(1, Math.min(120, ((x - TRACK_LEFT) / trackWidth) * duration));
      if (newDur >= 1) setDuration(newDur);
    } else if (dragRef.current === 'pan') {
      if (!panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.clientX;
      const timeDelta = -(dx / trackWidth) * (panStartRef.current.viewEnd - panStartRef.current.viewStart);
      let newStart = panStartRef.current.viewStart + timeDelta;
      let newEnd = panStartRef.current.viewEnd + timeDelta;
      const vd = newEnd - newStart;
      if (newStart < 0) { newStart = 0; newEnd = vd; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - vd; }
      if (newStart < 0) newStart = 0;
      setViewStart(newStart);
      setViewEndRaw(newEnd);
    } else if (dragRef.current === 'box-select') {
      if (boxSelectRef.current) {
        boxSelectRef.current.currentX = x;
        boxSelectRef.current.currentY = e.clientY - rect.top;
        const bs = boxSelectRef.current;
        setBoxSelectVisual({
          minX: Math.min(bs.startX, bs.currentX),
          minY: Math.min(bs.startY, bs.currentY),
          maxX: Math.max(bs.startX, bs.currentX),
          maxY: Math.max(bs.startY, bs.currentY),
        });
      }
    } else if (dragRef.current === 'selected-keyframes') {
      if (!selectedDragRef.current) return;
      const dx = e.clientX - selectedDragRef.current.startClientX;
      const timeDelta = (dx / trackWidth) * viewDuration;
      const idToDelta: Record<string, number> = {};
      for (const [id] of Object.entries(selectedDragRef.current.initialTimes)) {
        idToDelta[id] = timeDelta;
      }
      moveTimelineKeyframes(idToDelta);
    } else if (dragRef.current === 'loop') {
      if (!loopDragRef.current) return;
      const t = xToTime(x);
      const { edge, initialRegion } = loopDragRef.current;
      if (edge === 'start') {
        const newStart = Math.max(0, Math.min(t, initialRegion.end - 0.1));
        setLoopRegion({ start: newStart, end: initialRegion.end });
      } else {
        const newEnd = Math.min(duration, Math.max(t, initialRegion.start + 0.1));
        setLoopRegion({ start: initialRegion.start, end: newEnd });
      }
    }
  }, [xToTime, keyframes, moveTimelineKeyframe, duration, trackWidth, setCurrentTime, interpolateAndRestore, setDuration, viewDuration, setLoopRegion, moveTimelineKeyframes]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current === 'box-select' && boxSelectRef.current) {
      const { fieldTrackY } = getTrackYPositions();
      const bs = boxSelectRef.current;
      const minX = Math.min(bs.startX, bs.currentX);
      const maxX = Math.max(bs.startX, bs.currentX);
      const minY = Math.min(bs.startY, bs.currentY);
      const maxY = Math.max(bs.startY, bs.currentY);
      const selectedIds: string[] = [];
      for (const kf of keyframes) {
        const kfX = timeToX(kf.time);
        const kfY = fieldTrackY + FIELD_TRACK_HEIGHT / 2;
        if (kfX >= minX && kfX <= maxX && kfY >= minY && kfY <= maxY) {
          selectedIds.push(kf.id);
        }
      }
      setSelectedKeyframeIds(selectedIds);
      boxSelectRef.current = null;
      setBoxSelectVisual(null);
    }
    dragRef.current = null;
    dragKfIdRef.current = null;
    panStartRef.current = null;
    selectedDragRef.current = null;
    loopDragRef.current = null;
  }, [keyframes, timeToX, setSelectedKeyframeIds, getTrackYPositions]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    for (const kf of keyframes) {
      const kfX = timeToX(kf.time);
      if (Math.abs(x - kfX) < 8) {
        removeTimelineKeyframe(kf.id);
        return;
      }
    }
  }, [keyframes, timeToX, removeTimelineKeyframe]);

  const handleResizeDurationMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = 'duration';
  }, []);

  const annBarDragRef = useRef<{ annId: string; edge: 'start' | 'end' | null } | null>(null);

  const handleAnnotationBarMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { annTrackY } = getTrackYPositions();
    const barYBase = annTrackY + 2;

    let idx = 0;
    for (const ann of annotations) {
      if (ann.timeStart === null || ann.timeEnd === null) continue;
      const barY = barYBase + idx * (ANNOTATION_TRACK_HEIGHT - 4);
      if (y < barY || y > barY + ANNOTATION_TRACK_HEIGHT - 4) { idx++; continue; }

      const sx = timeToX(ann.timeStart);
      const ex = timeToX(ann.timeEnd);
      if (Math.abs(x - sx) < 6) {
        annBarDragRef.current = { annId: ann.id, edge: 'start' };
        e.preventDefault();
        return;
      }
      if (Math.abs(x - ex) < 6) {
        annBarDragRef.current = { annId: ann.id, edge: 'end' };
        e.preventDefault();
        return;
      }
      idx++;
    }
  }, [annotations, timeToX, getTrackYPositions]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (!annBarDragRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const t = xToTime(x);
    const { annId, edge } = annBarDragRef.current;
    const ann = annotations.find((a) => a.id === annId);
    if (!ann || ann.timeStart === null || ann.timeEnd === null) return;
    if (edge === 'start') {
      updateAnnotation(annId, { timeStart: Math.min(t, ann.timeEnd - 0.1) } as Partial<typeof ann>);
    } else if (edge === 'end') {
      updateAnnotation(annId, { timeEnd: Math.max(t, ann.timeStart + 0.1) } as Partial<typeof ann>);
    }
  }, [annotations, xToTime, updateAnnotation]);

  const handleGlobalMouseUp = useCallback(() => {
    annBarDragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  const handleBookmarkDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y > BOOKMARK_STRIP_HEIGHT || x < TRACK_LEFT || x > TRACK_LEFT + trackWidth) return;
    const t = xToTime(x);
    const existingBm = bookmarks.find((bm) => Math.abs(bm.time - t) < viewDuration * 0.01);
    if (existingBm) {
      removeBookmark(existingBm.id);
      return;
    }
    const bm: Bookmark = {
      id: genBookmarkId(),
      name: `标记${bookmarks.length + 1}`,
      time: t,
    };
    addBookmark(bm);
  }, [xToTime, bookmarks, addBookmark, removeBookmark, trackWidth, viewDuration]);

  const handleLoopRegionMouseDown = useCallback((e: React.MouseEvent) => {
    if (!e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < BOOKMARK_STRIP_HEIGHT) return;
    const t = xToTime(x);
    if (loopRegion) {
      const startDist = Math.abs(t - loopRegion.start);
      const endDist = Math.abs(t - loopRegion.end);
      if (startDist < endDist) {
        loopDragRef.current = { edge: 'start', initialRegion: { ...loopRegion } };
      } else {
        loopDragRef.current = { edge: 'end', initialRegion: { ...loopRegion } };
      }
      dragRef.current = 'loop';
    } else {
      setLoopRegion({ start: t, end: Math.min(t + 2, duration) });
      loopDragRef.current = { edge: 'end', initialRegion: { start: t, end: Math.min(t + 2, duration) } };
      dragRef.current = 'loop';
    }
  }, [xToTime, loopRegion, setLoopRegion, duration]);

  const ticks: number[] = [];
  const pixelsPerSecond = trackWidth / viewDuration;
  let tickInterval: number;
  if (pixelsPerSecond >= 200) tickInterval = 0.1;
  else if (pixelsPerSecond >= 80) tickInterval = 0.5;
  else if (pixelsPerSecond >= 40) tickInterval = 1;
  else if (pixelsPerSecond >= 15) tickInterval = 2;
  else if (pixelsPerSecond >= 8) tickInterval = 5;
  else tickInterval = 10;
  const firstTick = Math.ceil(viewStart / tickInterval) * tickInterval;
  for (let t = firstTick; t <= viewEnd; t += tickInterval) ticks.push(t);

  const annBars: Array<{ annId: string; annColor: string; timeStart: number; timeEnd: number; rowIdx: number }> = [];
  {
    let idx = 0;
    for (const ann of annotations) {
      if (ann.timeStart !== null && ann.timeEnd !== null) {
        annBars.push({ annId: ann.id, annColor: ann.color, timeStart: ann.timeStart, timeEnd: ann.timeEnd, rowIdx: idx });
        idx++;
      }
    }
  }

  const { fieldTrackY, separatorY, annTrackY } = getTrackYPositions();
  const totalHeight = annTrackY + Math.max(ANNOTATION_TRACK_HEIGHT, annBars.length * (ANNOTATION_TRACK_HEIGHT - 2) + 4) + 18;

  const selectedKfSet = new Set(selectedKeyframeIds);

  const formatTickLabel = (t: number) => {
    if (tickInterval < 1) return t.toFixed(1);
    return t.toFixed(0);
  };

  return (
    <div className="timeline-container">
      <div className="timeline-controls">
        <button
          onClick={() => {
            if (recording) {
              setRecording(false);
            } else {
              setPlaying(false);
              setRecording(true);
              setCurrentTime(0);
            }
          }}
          className={`timeline-btn ${recording ? 'recording' : ''}`}
          title={recording ? '停止录制' : '开始录制'}
        >
          {recording ? '⏹ 停止' : '⏺ 录制'}
        </button>
        <button
          onClick={() => {
            if (playing) {
              setPlaying(false);
            } else if (keyframes.length > 0) {
              setRecording(false);
              if (currentTime >= keyframes[keyframes.length - 1].time) {
                setCurrentTime(0);
                interpolateAndRestore(0);
              }
              setPlaying(true);
            }
          }}
          className={`timeline-btn ${playing ? 'playing' : ''}`}
          disabled={keyframes.length === 0}
          title={playing ? '暂停播放' : '播放'}
        >
          {playing ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setCurrentTime(0);
            if (keyframes.length > 0) interpolateAndRestore(0);
          }}
          className="timeline-btn"
          disabled={keyframes.length === 0}
          title="回到起点"
        >
          ⏮ 起点
        </button>
        <button
          onClick={insertManualKeyframe}
          className="timeline-btn"
          disabled={playing}
          title="在当前位置插入手动关键帧"
        >
          + 插入帧
        </button>
        <select
          className="timeline-speed-select"
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
          title="播放速度"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
        <span className="timeline-time-display">
          {currentTime.toFixed(2)}s / {duration.toFixed(0)}s
        </span>
        <span className="timeline-kf-count">
          关键帧: {keyframes.length}
        </span>
        {selectedKeyframeIds.length > 0 && (
          <span className="timeline-selection-info">
            已选 {selectedKeyframeIds.length} 帧
          </span>
        )}
        {loopRegion && (
          <button
            className="timeline-btn loop-clear-btn"
            onClick={() => setLoopRegion(null)}
            title="清除循环区间"
          >
            清除循环
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className="timeline-track-area"
        onMouseDown={(e) => {
          handleLoopRegionMouseDown(e);
          if (dragRef.current === 'loop') return;
          handleAnnotationBarMouseDown(e);
          handleMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onDoubleClick={handleBookmarkDoubleClick}
      >
        <svg
          width="100%"
          height={totalHeight}
          style={{ display: 'block' }}
        >
          <rect x={0} y={0} width="100%" height={totalHeight} fill="transparent" />

          <rect x={TRACK_LEFT} y={0} width={trackWidth} height={BOOKMARK_STRIP_HEIGHT} fill="#0e0e1a" />
          {bookmarks.map((bm) => {
            const bx = timeToX(bm.time);
            return (
              <g key={bm.id}>
                <polygon
                  points={`${bx - 4},0 ${bx + 4},0 ${bx},${BOOKMARK_STRIP_HEIGHT}`}
                  fill="#8af"
                  opacity={0.8}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setCurrentTime(bm.time);
                    if (keyframes.length > 0) interpolateAndRestore(bm.time);
                  }}
                />
                <title>{bm.name} ({bm.time.toFixed(2)}s)</title>
              </g>
            );
          })}

          <rect x={TRACK_LEFT} y={fieldTrackY} width={trackWidth} height={FIELD_TRACK_HEIGHT} fill="#1a1a2a" stroke="#333" strokeWidth={1} rx={3} />

          {ticks.map((t) => {
            const x = timeToX(t);
            if (x < TRACK_LEFT || x > TRACK_LEFT + trackWidth) return null;
            return (
              <g key={t}>
                <line x1={x} y1={fieldTrackY} x2={x} y2={fieldTrackY + TICK_HEIGHT} stroke="#555" strokeWidth={1} />
                <text x={x} y={annTrackY + ANNOTATION_TRACK_HEIGHT + 12} textAnchor="middle" fill="#666" fontSize={8} fontFamily="monospace">
                  {formatTickLabel(t)}s
                </text>
              </g>
            );
          })}

          {keyframes.map((kf) => {
            const x = timeToX(kf.time);
            if (x < TRACK_LEFT - 10 || x > TRACK_LEFT + trackWidth + 10) return null;
            const diamondY = fieldTrackY + FIELD_TRACK_HEIGHT / 2;
            const size = 6;
            const isSelected = selectedKfSet.has(kf.id);
            return (
              <polygon
                key={kf.id}
                points={`${x},${diamondY - size} ${x + size},${diamondY} ${x},${diamondY + size} ${x - size},${diamondY}`}
                fill={isSelected ? '#ffd93d' : 'transparent'}
                stroke={isSelected ? '#ffd93d' : '#aa8800'}
                strokeWidth={1.5}
                style={{ cursor: 'grab' }}
              />
            );
          })}

          <line x1={TRACK_LEFT} y1={separatorY} x2={TRACK_LEFT + trackWidth} y2={separatorY} stroke="#444" strokeWidth={1} />

          <rect x={TRACK_LEFT} y={annTrackY} width={trackWidth} height={ANNOTATION_TRACK_HEIGHT} fill="#14141e" stroke="#333" strokeWidth={1} rx={3} />

          {annBars.map((bar) => {
            const sx = timeToX(bar.timeStart);
            const ex = timeToX(bar.timeEnd);
            const barY = annTrackY + 2 + bar.rowIdx * (ANNOTATION_TRACK_HEIGHT - 4);
            return (
              <g key={bar.annId}>
                <rect
                  x={sx}
                  y={barY}
                  width={Math.max(4, ex - sx)}
                  height={ANNOTATION_TRACK_HEIGHT - 6}
                  fill={bar.annColor}
                  opacity={0.6}
                  rx={2}
                />
                <circle
                  cx={sx}
                  cy={barY + (ANNOTATION_TRACK_HEIGHT - 6) / 2}
                  r={3}
                  fill={bar.annColor}
                  stroke="#fff"
                  strokeWidth={1}
                  style={{ cursor: 'ew-resize' }}
                />
                <circle
                  cx={ex}
                  cy={barY + (ANNOTATION_TRACK_HEIGHT - 6) / 2}
                  r={3}
                  fill={bar.annColor}
                  stroke="#fff"
                  strokeWidth={1}
                  style={{ cursor: 'ew-resize' }}
                />
              </g>
            );
          })}

          {loopRegion && (
            <rect
              x={timeToX(loopRegion.start)}
              y={BOOKMARK_STRIP_HEIGHT + 2}
              width={Math.max(1, timeToX(loopRegion.end) - timeToX(loopRegion.start))}
              height={annTrackY + ANNOTATION_TRACK_HEIGHT - BOOKMARK_STRIP_HEIGHT - 2}
              fill="#4d96ff"
              opacity={0.12}
            />
          )}

          {loopRegion && (
            <>
              <line x1={timeToX(loopRegion.start)} y1={BOOKMARK_STRIP_HEIGHT + 2} x2={timeToX(loopRegion.start)} y2={annTrackY + ANNOTATION_TRACK_HEIGHT} stroke="#4d96ff" strokeWidth={2} opacity={0.6} />
              <line x1={timeToX(loopRegion.end)} y1={BOOKMARK_STRIP_HEIGHT + 2} x2={timeToX(loopRegion.end)} y2={annTrackY + ANNOTATION_TRACK_HEIGHT} stroke="#4d96ff" strokeWidth={2} opacity={0.6} />
            </>
          )}

          {(() => {
            const phX = timeToX(currentTime);
            return (
              <g>
                <line x1={phX} y1={BOOKMARK_STRIP_HEIGHT} x2={phX} y2={annTrackY + ANNOTATION_TRACK_HEIGHT} stroke="#ff4444" strokeWidth={2} style={{ cursor: 'col-resize' }} />
                <polygon
                  points={`${phX - 5},2 ${phX + 5},2 ${phX},8`}
                  fill="#ff4444"
                />
              </g>
            );
          })()}

          {(() => {
            const resizeX = TRACK_LEFT + trackWidth;
            return (
              <g style={{ cursor: 'ew-resize' }} onMouseDown={handleResizeDurationMouseDown}>
                <rect x={resizeX - 3} y={fieldTrackY} width={6} height={FIELD_TRACK_HEIGHT} fill="transparent" />
                <line x1={resizeX} y1={fieldTrackY + 4} x2={resizeX} y2={fieldTrackY + FIELD_TRACK_HEIGHT - 4} stroke="#888" strokeWidth={2} />
              </g>
            );
          })()}

          {boxSelectVisual && (
            <rect
              x={boxSelectVisual.minX}
              y={boxSelectVisual.minY}
              width={boxSelectVisual.maxX - boxSelectVisual.minX}
              height={boxSelectVisual.maxY - boxSelectVisual.minY}
              fill="#4d96ff"
              opacity={0.15}
              stroke="#4d96ff"
              strokeWidth={1}
              strokeDasharray="4,2"
            />
          )}

          {annotationKeyframes.map((akf) => {
            const x = timeToX(akf.time);
            if (x < TRACK_LEFT - 10 || x > TRACK_LEFT + trackWidth + 10) return null;
            const ann = annotations.find((a) => a.id === akf.annotationId);
            if (!ann) return null;
            return (
              <circle
                key={akf.id}
                cx={x}
                cy={annTrackY + ANNOTATION_TRACK_HEIGHT - 3}
                r={2}
                fill={ann.color}
                stroke="#fff"
                strokeWidth={0.5}
              />
            );
          })}
        </svg>
      </div>

      {bookmarks.length > 0 && (
        <div className="timeline-bookmarks-list">
          {bookmarks.map((bm) => (
            <div key={bm.id} className="bookmark-item">
              {renamingBookmarkId === bm.id ? (
                <input
                  className="bookmark-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    renameBookmark(bm.id, renameValue || bm.name);
                    setRenamingBookmarkId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameBookmark(bm.id, renameValue || bm.name);
                      setRenamingBookmarkId(null);
                    }
                    if (e.key === 'Escape') setRenamingBookmarkId(null);
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className="bookmark-name"
                  onClick={() => {
                    setCurrentTime(bm.time);
                    if (keyframes.length > 0) interpolateAndRestore(bm.time);
                  }}
                  onDoubleClick={() => {
                    setRenamingBookmarkId(bm.id);
                    setRenameValue(bm.name);
                  }}
                >
                  {bm.name}
                </span>
              )}
              <span className="bookmark-time">{bm.time.toFixed(2)}s</span>
              <button
                className="bookmark-delete-btn"
                onClick={() => removeBookmark(bm.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
