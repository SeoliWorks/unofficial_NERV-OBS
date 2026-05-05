import type { ParsedPost } from '../nerv/types';
import { PostItem } from './PostItem';

type Props = {
  posts: ParsedPost[];
  emptyMessage: string;
  onDismiss: (id: string) => void;
};

export function WidgetList({ posts, emptyMessage, onDismiss }: Props): JSX.Element {
  if (posts.length === 0) {
    return <div className="widget__empty">{emptyMessage}</div>;
  }
  return (
    <ul className="widget__list">
      {posts.map((post) => (
        <li key={post.id} className="widget__list-item">
          <PostItem post={post} onDismiss={onDismiss} />
        </li>
      ))}
    </ul>
  );
}
