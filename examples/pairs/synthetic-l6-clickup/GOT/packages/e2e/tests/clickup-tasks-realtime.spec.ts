import { test, expect } from '../utils/test'
import { t } from '../utils/i18n'
import {
	createWorkspace,
	createSpace,
	addList,
	createTask,
	changeTaskStatus,
	TaskStatusEnum,
	TaskPriorityEnum,
} from '@codedm/client-typescript/typescript'

/**
 * TC-01: Kanban Board SSE realtime — task moves column without page reload
 *
 * As a workspace member
 * I want to see a task move to a new status column immediately after its status
 * is changed via the API
 * So that I get a live board without having to refresh the page
 *
 * Proves the SSE invalidation path:
 *   PATCH /v1/task/tasks/:taskId/status → backend publishes integration event
 *   → SSE stream delivers event to the frontend
 *   → React Query invalidates the task list query
 *   → Board re-renders with the task in the new column
 *   All without a page reload.
 */
test.describe('Kanban Board — realtime status update via SSE', () => {
	test('task moves to IN_PROGRESS column without reload when status changed via API', async ({
		page,
		given,
		network,
	}) => {
		// ── 1. Seed: authenticated fresh user ────────────────────────────────────
		const { session } = await given.freshUser({ name: 'Board User' })

		// ── 2. Seed: bootstrap the workspace for this user's store ───────────────
		const workspaceResult = await createWorkspace(
			{ name: 'My Workspace' },
			{ client: session.client },
		)
		expect(workspaceResult).toBeDefined()
		expect(workspaceResult.workspaceId).toBeTruthy()

		// ── 3. Seed: create a space ───────────────────────────────────────────────
		const spaceResult = await createSpace(
			{ name: 'Engineering' },
			{ client: session.client },
		)
		expect(spaceResult).toBeDefined()
		const spaceId = spaceResult.spaceId
		expect(spaceId).toBeTruthy()

		// ── 4. Seed: add a list to the space ─────────────────────────────────────
		const listResult = await addList(
			spaceId,
			{ name: 'Backlog' },
			{ client: session.client },
		)
		expect(listResult).toBeDefined()
		const listId = listResult.listId
		expect(listId).toBeTruthy()

		// ── 5. Seed: create a task (starts in TODO) ───────────────────────────────
		const taskResult = await createTask(
			{
				spaceId,
				listId,
				title: 'Ship realtime board',
				priority: TaskPriorityEnum.NORMAL,
			},
			{ client: session.client },
		)
		expect(taskResult).toBeDefined()
		const taskId = taskResult.taskId
		expect(taskId).toBeTruthy()

		// ── 6. Navigate to the space board view ───────────────────────────────────
		// The spaces route is not yet registered in routeTree.gen.ts (pending
		// route generation), so we resolve the path directly instead of using the
		// typed goto fixture to avoid a compile-time union mismatch.
		await Promise.race([
			page.goto(`/spaces/${spaceId}`),
			network.waitForFailure(),
		])

		// Switch to Board view via the toggle button
		await page.getByRole('button', { name: t('clickup.view.board') }).click()

		// Wait for the board to render (column container must appear)
		await expect(page.getByTestId(`board-column-${TaskStatusEnum.TODO}`)).toBeVisible()

		// ── 7. Assert: task card is initially in the TODO column ──────────────────
		await expect(
			page
				.getByTestId(`board-column-${TaskStatusEnum.TODO}`)
				.getByTestId(`task-card-${taskId}`),
		).toBeVisible()

		// Confirm the task is NOT already in IN_PROGRESS
		await expect(
			page
				.getByTestId(`board-column-${TaskStatusEnum.IN_PROGRESS}`)
				.getByTestId(`task-card-${taskId}`),
		).toHaveCount(0)

		// ── 8. Trigger the status change via the API — NOT via the UI ─────────────
		const statusChangeResult = await changeTaskStatus(
			taskId,
			{ toStatus: TaskStatusEnum.IN_PROGRESS },
			{ client: session.client },
		)
		expect(statusChangeResult.taskId).toBe(taskId)
		expect(statusChangeResult.status).toBe(TaskStatusEnum.IN_PROGRESS)

		// ── 9. Assert SSE-driven UI update — NO page.reload() ────────────────────
		// Playwright auto-retries these assertions until the SSE event arrives,
		// React Query invalidates, and the board re-renders with the task moved.

		// Task card must appear in the IN_PROGRESS column
		await expect(
			page
				.getByTestId(`board-column-${TaskStatusEnum.IN_PROGRESS}`)
				.getByTestId(`task-card-${taskId}`),
		).toBeVisible()

		// Task card must be gone from the TODO column
		await expect(
			page
				.getByTestId(`board-column-${TaskStatusEnum.TODO}`)
				.getByTestId(`task-card-${taskId}`),
		).toHaveCount(0)
	})
})
