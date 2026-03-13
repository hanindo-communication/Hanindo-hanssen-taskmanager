'use client';

import Link from 'next/link';
import type { Board, TaskItem } from '@/lib/types/board';
import { getAllTasks, formatDate } from '@/lib/utils/board';
import styles from './PendingTasksSegment.module.css';

type PendingTasksSegmentProps = {
  boards: Board[];
};

function getPendingTasks(board: Board): TaskItem[] {
  return getAllTasks(board).filter((t) => t.status === 'pending');
}

export function PendingTasksSegment({ boards }: PendingTasksSegmentProps) {
  const boardsWithPending = boards
    .map((board) => ({ board, tasks: getPendingTasks(board) }))
    .filter(({ tasks }) => tasks.length > 0);

  if (boardsWithPending.length === 0) {
    return (
      <section className={styles.segment} aria-labelledby="pending-tasks-title">
        <h2 id="pending-tasks-title" className={styles.title}>
          Pending Tasks
        </h2>
        <p className={styles.empty}>No pending tasks across your projects.</p>
      </section>
    );
  }

  return (
    <section className={styles.segment} aria-labelledby="pending-tasks-title">
      <h2 id="pending-tasks-title" className={styles.title}>
        Pending Tasks
      </h2>
      <p className={styles.description}>
        Tasks with status Pending, grouped by project. Connect to your Programs/Projects.
      </p>
      <div className={styles.grid}>
        {boardsWithPending.map(({ board, tasks }) => (
          <div key={board.id} className={styles.card}>
            <Link href={`/boards/${board.id}#list-of-tasks`} className={styles.cardTitleLink}>
              <h3 className={styles.cardTitle}>{board.name}</h3>
            </Link>
            <ul className={styles.taskList}>
              {tasks.map((task) => (
                <li key={task.id} className={styles.taskItem}>
                  <Link
                    href={`/boards/${board.id}#list-of-tasks`}
                    className={styles.taskLink}
                    title={task.notes || undefined}
                  >
                    <span className={styles.taskName}>{task.name}</span>
                    {task.dueDate && (
                      <span className={styles.taskDue}>Due {formatDate(task.dueDate)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
