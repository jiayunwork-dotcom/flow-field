import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Keyframe } from '../store/types';

const TRACK_LEFT = 40;
const TRACK_RIGHT = 16;
const TRACK_HEIGHT = 24;
const ANNOTATION_BAR_HEIGHT = 10;
const TICK_HEIGHT = 6;

let _recKfId = 1;
function recGenId() { return `rkf_${_recKfId++}_${Date.now()}`; }

export function Timeline() {
  const duration = useAppStore((s) => s.timelineDuration);
  const currentTime = useAppStore((s) => s.timelineCurrentTime);
  const recording = useAppStore((s) => s.timelineRecording);
  const playing = useAppStore((s) => s.timelinePlaying);
  const keyframes = useAppStore((s) => s.timelineKeyframes);
  const annotations = useAppStore((s) => s.annotations);
  const annotationKeyframes = useAppStore((s) => s.annotationKeyframes);

  const setDuration = useAppStore((s) => s.setTimelineDuration);
  const setCurrentTime = useAppStore((s) => s.setTimelineCurrentTime);
  const setRecording = useAppStore((s) => s.setTimelineRecording);
  const setPlaying = useAppStore((s) => s.setTimelinePlaying);
  const addTimelineKeyframe = useAppStore((s) => s.addTimelineKeyframe);
  const removeTimelineKeyframe = useAppStore((s) => s.removeTimelineKeyframe);
  const moveTimelineKeyframe = useAppStore((s) => s.moveTimelineKeyframe);
  const insertManualKeyframe = useAppStore((s) => s.insertManualKeyframe);
  const captureFieldSnapshot = useAppStore((s) => s.captureFieldSnapshot);
  const interpolateAndRestore = useAppStore((s) => s.interpolateAndRestore);
  const updateAnnotation = useAppStore((s) => s.updateAnnotation);

  const containerRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(200);
  const dragRef = useRef<'playhead' | 'keyframe' | 'duration' | null>(null);
  const dragKfIdRef = useRef<string | null>(null);
  const recordingTimerRef = useRef<number>(0);
  const lastRecordTimeRef = useRef<number>(0);
  const playStartRef = useRef<{ time: number; startMs: number } | null>(null);
  const animFrameRef = useRef<number>(0);

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

  const timeToX = useCallback((t: number) => {
    return TRACK_LEFT + (t / duration) * trackWidth;
  }, [duration, trackWidth]);

  const xToTime = useCallback((x: number) => {
    const t = ((x - TRACK_LEFT) / trackWidth) * duration;
    return Math.max(0, Math.min(duration, t));
  }, [duration, trackWidth]);

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
      const elapsed = (performance.now() - start.startMs) / 1000;
      let t = start.time + elapsed;
      if (t >= maxT) {
        t = maxT;
        setPlaying(false);
        setCurrentTime(t);
        interpolateAndRestore(t);
        return;
      }
      setCurrentTime(t);
      interpolateAndRestore(t);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, keyframes, currentTime, setPlaying, setCurrentTime, interpolateAndRestore]);

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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const resizeHandleX = TRACK_LEFT + trackWidth;
    if (Math.abs(x - resizeHandleX) < 8) {
      dragRef.current = 'duration';
      e.preventDefault();
      return;
    }

    const playheadX = timeToX(currentTime);
    if (Math.abs(x - playheadX) < 6 && y >= 20 && y <= 70) {
      dragRef.current = 'playhead';
      setPlaying(false);
      e.preventDefault();
      return;
    }

    for (const kf of keyframes) {
      const kfX = timeToX(kf.time);
      if (Math.abs(x - kfX) < 6 && y >= 30 && y <= 65) {
        dragRef.current = 'keyframe';
        dragKfIdRef.current = kf.id;
        e.preventDefault();
        return;
      }
    }

    if (x >= TRACK_LEFT && x <= TRACK_LEFT + trackWidth && y >= 20 && y <= 70) {
      const t = xToTime(x);
      setCurrentTime(t);
      if (keyframes.length > 0) interpolateAndRestore(t);
      dragRef.current = 'playhead';
      e.preventDefault();
    }
  }, [currentTime, keyframes, timeToX, xToTime, trackWidth, setPlaying, setCurrentTime, interpolateAndRestore]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
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
    }
  }, [xToTime, keyframes, moveTimelineKeyframe, duration, trackWidth, setCurrentTime, interpolateAndRestore, setDuration]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    dragKfIdRef.current = null;
  }, []);

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

    const barYBase = 6;
    let idx = 0;
    for (const ann of annotations) {
      if (ann.timeStart === null || ann.timeEnd === null) continue;
      const barY = barYBase + idx * (ANNOTATION_BAR_HEIGHT + 2);
      if (y < barY || y > barY + ANNOTATION_BAR_HEIGHT) { idx++; continue; }

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
  }, [annotations, timeToX]);

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

  const ticks: number[] = [];
  const tickInterval = duration <= 10 ? 1 : duration <= 30 ? 5 : duration <= 60 ? 10 : 15;
  for (let t = 0; t <= duration; t += tickInterval) ticks.push(t);

  const annBars: Array<{ annId: string; annColor: string; timeStart: number; timeEnd: number; barY: number }> = [];
  {
    let idx = 0;
    for (const ann of annotations) {
      if (ann.timeStart !== null && ann.timeEnd !== null) {
        annBars.push({ annId: ann.id, annColor: ann.color, timeStart: ann.timeStart, timeEnd: ann.timeEnd, barY: 6 + idx * (ANNOTATION_BAR_HEIGHT + 2) });
        idx++;
      }
    }
  }

  const maxAnnBarsHeight = annBars.length * (ANNOTATION_BAR_HEIGHT + 2) + 4;
  const trackY = Math.max(maxAnnBarsHeight + 4, 20);

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
        <span className="timeline-time-display">
          {currentTime.toFixed(1)}s / {duration.toFixed(0)}s
        </span>
        <span className="timeline-kf-count">
          关键帧: {keyframes.length}
        </span>
      </div>
      <div
        ref={containerRef}
        className="timeline-track-area"
        onMouseDown={(e) => {
          handleAnnotationBarMouseDown(e);
          handleMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      >
        <svg
          width="100%"
          height={80}
          style={{ display: 'block' }}
        >
          <rect x={0} y={0} width="100%" height={80} fill="transparent" />

          {annBars.map((bar) => (
            <g key={bar.annId}>
              <rect
                x={timeToX(bar.timeStart)}
                y={bar.barY}
                width={Math.max(4, timeToX(bar.timeEnd) - timeToX(bar.timeStart))}
                height={ANNOTATION_BAR_HEIGHT}
                fill={bar.annColor}
                opacity={0.6}
                rx={2}
              />
              <circle
                cx={timeToX(bar.timeStart)}
                cy={bar.barY + ANNOTATION_BAR_HEIGHT / 2}
                r={3}
                fill={bar.annColor}
                stroke="#fff"
                strokeWidth={1}
                style={{ cursor: 'ew-resize' }}
              />
              <circle
                cx={timeToX(bar.timeEnd)}
                cy={bar.barY + ANNOTATION_BAR_HEIGHT / 2}
                r={3}
                fill={bar.annColor}
                stroke="#fff"
                strokeWidth={1}
                style={{ cursor: 'ew-resize' }}
              />
            </g>
          ))}

          <rect
            x={TRACK_LEFT}
            y={trackY}
            width={trackWidth}
            height={TRACK_HEIGHT}
            fill="#1a1a2a"
            stroke="#333"
            strokeWidth={1}
            rx={3}
          />

          {ticks.map((t) => {
            const x = timeToX(t);
            return (
              <g key={t}>
                <line x1={x} y1={trackY} x2={x} y2={trackY + TICK_HEIGHT} stroke="#555" strokeWidth={1} />
                <text x={x} y={trackY + TICK_HEIGHT + 10} textAnchor="middle" fill="#666" fontSize={8} fontFamily="monospace">
                  {t}s
                </text>
              </g>
            );
          })}

          {keyframes.map((kf) => {
            const x = timeToX(kf.time);
            const diamondY = trackY + TRACK_HEIGHT / 2;
            const size = 6;
            return (
              <polygon
                key={kf.id}
                points={`${x},${diamondY - size} ${x + size},${diamondY} ${x},${diamondY + size} ${x - size},${diamondY}`}
                fill="#ffd93d"
                stroke="#aa8800"
                strokeWidth={1}
                style={{ cursor: 'grab' }}
              />
            );
          })}

          {(() => {
            const phX = timeToX(currentTime);
            return (
              <g>
                <line x1={phX} y1={2} x2={phX} y2={trackY + TRACK_HEIGHT} stroke="#ff4444" strokeWidth={2} style={{ cursor: 'col-resize' }} />
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
                <rect x={resizeX - 3} y={trackY} width={6} height={TRACK_HEIGHT} fill="transparent" />
                <line x1={resizeX} y1={trackY + 4} x2={resizeX} y2={trackY + TRACK_HEIGHT - 4} stroke="#888" strokeWidth={2} />
              </g>
            );
          })()}

          {annotationKeyframes.map((akf) => {
            const x = timeToX(akf.time);
            const ann = annotations.find((a) => a.id === akf.annotationId);
            if (!ann) return null;
            return (
              <circle
                key={akf.id}
                cx={x}
                cy={trackY + TRACK_HEIGHT + 8}
                r={3}
                fill={ann.color}
                stroke="#fff"
                strokeWidth={0.5}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
