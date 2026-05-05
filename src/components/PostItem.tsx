import { memo, useEffect, useRef, useState } from 'react';
import type { ParsedPost } from '../nerv/types';
import { CATEGORY_LABEL } from '../nerv/types';

const DISMISS_DURATION_MS = 350;

type Props = {
  post: ParsedPost;
  onDismiss: (id: string) => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const PostItem = memo(function PostItem({ post, onDismiss }: Props): JSX.Element {
  const [entered, setEntered] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const handleDismiss = () => {
    setDismissing(true);
    dismissTimerRef.current = setTimeout(() => onDismiss(post.id), DISMISS_DURATION_MS);
  };

  const intensityClass = post.intensity ? `intensity-${post.intensity.replace('+', 'p').replace('-', 'm')}` : '';

  return (
    <article
      className={`post post--${post.severity} post--${post.category} ${entered ? 'post--entered' : ''} ${dismissing ? 'post--dismissing' : ''}`}
      data-category={post.category}
    >
      <header className="post__header">
        <span className={`post__badge post__badge--${post.category}`}>{CATEGORY_LABEL[post.category]}</span>
        {post.intensity && (
          <span className={`post__intensity ${intensityClass}`}>震度 {post.intensity}</span>
        )}
        {post.isFinalReport && <span className="post__final">最終報</span>}
        <button
          className="post__dismiss"
          type="button"
          aria-label="この投稿を閉じる"
          onClick={handleDismiss}
          disabled={dismissing}
        >✕</button>
        <time className="post__time" dateTime={post.createdAt}>{formatTime(post.createdAt)}</time>
      </header>
      <h2 className="post__title">{post.title}</h2>
      {post.body && <p className="post__body">{post.body}</p>}
    </article>
  );
});
