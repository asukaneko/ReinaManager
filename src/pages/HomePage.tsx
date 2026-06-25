/**
 * @file Home 页面
 * @description 应用首页，展示游戏统计信息、动态、最近游玩、最近添加等内容，支持国际化。
 * @module src/pages/Home/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import {
	Notifications as ActivityIcon,
	ArrowForward as ArrowForwardIcon,
	EmojiEvents as CompletedIcon,
	SportsEsports as GamesIcon,
	Storage as LocalIcon,
	CalendarMonth as MonthIcon,
	AddCircle as RecentlyAddedIcon,
	Gamepad as RecentlyPlayedIcon,
	Inventory as RepositoryIcon,
	SwapHoriz as SwitchIcon,
	AccessTime as TimeIcon,
	Today as TodayIcon,
	DateRange as WeekIcon,
} from "@mui/icons-material";
import {
	Avatar,
	Box,
	Button,
	Card,
	CardActionArea,
	CardContent,
	Chip,
	IconButton,
	Skeleton,
	Tooltip,
	Typography,
} from "@mui/material";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import {
	usePlayTimeSummary,
	useRecentSessionsForGames,
} from "@/hooks/queries/useStats";
import { useStore } from "@/store/appStore";
import type { GameData, GameSession } from "@/types";
import { PlayStatus } from "@/types/collection";
import { formatPlayTime, formatRelativeTime } from "@/utils/dateTime";
import { getGameCover, getGameDisplayName } from "@/utils/game";

interface RecentSession {
	session_id: number;
	game_id: number;
	end_time: number;
	gameTitle: string;
	imageUrl: string;
	duration?: number;
}

interface RecentGame {
	id: number;
	title: string;
	imageUrl: string;
	time: number;
}

interface ActivityItem {
	id: string;
	type: "add" | "play";
	gameId: number;
	gameTitle: string;
	imageUrl: string;
	time: number;
	duration?: number;
}

interface GamePreview {
	id: number;
	title: string;
	imageUrl: string;
	isLocal: boolean;
	createdAt?: number;
}

interface StatCardItem {
	title: string;
	value: React.ReactNode;
	icon: React.ReactNode;
	isAsync: boolean;
	toneClassName: string;
	action?: React.ReactNode;
}

const cardBorderClass =
	"border border-solid border-[--mui-palette-divider] shadow-sm";

const gameCardSkeletonKeys = [
	"game-card-skeleton-1",
	"game-card-skeleton-2",
	"game-card-skeleton-3",
	"game-card-skeleton-4",
];
const activitySkeletonKeys = [
	"activity-skeleton-1",
	"activity-skeleton-2",
	"activity-skeleton-3",
	"activity-skeleton-4",
	"activity-skeleton-5",
	"activity-skeleton-6",
];
const previewSkeletonKeys = [
	"preview-skeleton-1",
	"preview-skeleton-2",
	"preview-skeleton-3",
	"preview-skeleton-4",
	"preview-skeleton-5",
	"preview-skeleton-6",
	"preview-skeleton-7",
	"preview-skeleton-8",
	"preview-skeleton-9",
	"preview-skeleton-10",
	"preview-skeleton-11",
	"preview-skeleton-12",
];

const twoLineTextSx = {
	display: "-webkit-box",
	WebkitBoxOrient: "vertical",
	WebkitLineClamp: 2,
	overflow: "hidden",
};

function getRepositoryPreviewLimit(columnCount: number) {
	if (columnCount <= 2) return 6;
	if (columnCount === 3) return 9;
	if (columnCount === 4) return 12;
	return 10;
}

function getRepositoryPreviewColumnCount(element: HTMLElement) {
	const gridTemplateColumns =
		window.getComputedStyle(element).gridTemplateColumns;
	if (!gridTemplateColumns || gridTemplateColumns === "none") return 5;
	return gridTemplateColumns.split(/\s+/).filter(Boolean).length;
}

function buildGameActivities(
	games: GameData[],
	recentSessions: GameSession[],
): {
	sessions: RecentSession[];
	added: RecentGame[];
	activities: ActivityItem[];
} {
	const playItems: ActivityItem[] = [];
	const sessions: RecentSession[] = [];
	const gameById = new Map(games.map((game) => [game.id, game]));

	for (const session of recentSessions) {
		if (typeof session.end_time !== "number") continue;

		const game = gameById.get(session.game_id);
		if (!game) continue;

		const gameTitle = getGameDisplayName(game);
		const imageUrl = getGameCover(game);

		const item: ActivityItem = {
			id: `play-${session.session_id || game.id}-${session.end_time}`,
			type: "play",
			gameId: game.id,
			gameTitle,
			imageUrl,
			time: session.end_time,
			duration: session.duration,
		};
		playItems.push(item);

		sessions.push({
			session_id: session.session_id,
			game_id: game.id,
			end_time: session.end_time,
			gameTitle,
			imageUrl,
			duration: session.duration,
		});
	}

	const addItems: ActivityItem[] = [];
	const added: RecentGame[] = [];

	for (const game of games.filter((game) => game.created_at)) {
		const timestamp = game.created_at as number;
		const gameTitle = getGameDisplayName(game);
		const imageUrl = getGameCover(game);

		addItems.push({
			id: `add-${game.id}`,
			type: "add",
			gameId: game.id,
			gameTitle,
			imageUrl,
			time: timestamp,
		});

		added.push({
			id: game.id,
			title: gameTitle,
			imageUrl,
			time: timestamp,
		});
	}

	const allActivities = [...playItems, ...addItems].toSorted(
		(a, b) => b.time - a.time,
	);

	const sortedSessions = sessions.toSorted((a, b) => b.end_time - a.end_time);
	const uniqueSessions: RecentSession[] = [];
	const seenGameIds = new Set<number>();
	for (const session of sortedSessions) {
		if (seenGameIds.has(session.game_id)) continue;
		seenGameIds.add(session.game_id);
		uniqueSessions.push(session);
	}
	const sortedAdded = added.toSorted((a, b) => b.time - a.time);

	return {
		sessions: uniqueSessions.slice(0, 8),
		added: sortedAdded.slice(0, 8),
		activities: allActivities.slice(0, 16),
	};
}

function StatCard({
	card,
	isLoading,
}: {
	card: StatCardItem;
	isLoading: boolean;
}) {
	return (
		<Card
			className={`h-full overflow-hidden transition-shadow hover:shadow-md ${cardBorderClass}`}
		>
			<CardContent className="relative min-h-34 flex flex-col">
				{card.action}
				<Box
					className={`h-11 w-11 flex items-center justify-center rounded-3 bg-[--mui-palette-action-hover] ${card.toneClassName}`}
				>
					{card.icon}
				</Box>
				<Typography
					title={typeof card.value === "string" ? card.value : undefined}
					variant="h5"
					className="mt-4 w-full truncate font-bold"
				>
					{card.isAsync && isLoading ? <Skeleton width="72%" /> : card.value}
				</Typography>
				<Typography
					variant="body2"
					color="text.secondary"
					className="mt-1 truncate"
				>
					{card.title}
				</Typography>
			</CardContent>
		</Card>
	);
}

function SectionHeader({
	icon,
	title,
	action,
}: {
	icon: React.ReactNode;
	title: string;
	action?: React.ReactNode;
}) {
	return (
		<Box className="mb-3 flex items-center justify-between gap-3">
			<Box className="min-w-0 flex items-center gap-2">
				{icon}
				<Typography variant="h6" className="truncate font-bold">
					{title}
				</Typography>
			</Box>
			{action}
		</Box>
	);
}

function EmptyCard({
	icon,
	message,
	action,
}: {
	icon: React.ReactNode;
	message: string;
	action?: React.ReactNode;
}) {
	return (
		<Card className={cardBorderClass}>
			<CardContent className="min-h-44 flex flex-col items-center justify-center gap-3 text-center">
				{icon}
				<Typography color="text.secondary">{message}</Typography>
				{action}
			</CardContent>
		</Card>
	);
}

function GameCoverCard({
	game,
	meta,
	badge,
}: {
	game: Pick<GamePreview, "id" | "title" | "imageUrl">;
	meta?: string;
	badge?: string;
}) {
	return (
		<Card
			className={`h-full overflow-hidden transition-shadow hover:shadow-md ${cardBorderClass}`}
		>
			<CardActionArea
				component={Link}
				to={`/libraries/${game.id}`}
				className="h-full"
			>
				<Box className="relative aspect-[3/4] overflow-hidden">
					<Box
						component="img"
						src={game.imageUrl}
						alt={game.title}
						draggable={false}
						loading="lazy"
						className="h-full w-full object-cover transition-transform duration-200 hover:scale-103"
					/>
					{badge && (
						<Chip
							size="small"
							label={badge}
							className="!absolute left-2 top-2 !font-bold"
							sx={{
								bgcolor: "background.paper",
								color: "text.primary",
							}}
						/>
					)}
				</Box>
				<Box className="p-3">
					<Typography
						title={game.title}
						variant="subtitle2"
						className="font-bold"
						sx={twoLineTextSx}
					>
						{game.title}
					</Typography>
					{meta && (
						<Typography
							variant="caption"
							color="text.secondary"
							className="mt-1 block truncate"
						>
							{meta}
						</Typography>
					)}
				</Box>
			</CardActionArea>
		</Card>
	);
}

function ActivityCard({
	activity,
	addedLabel,
	playedLabel,
	timeLabel,
	durationLabel,
}: {
	activity: ActivityItem;
	addedLabel: string;
	playedLabel: string;
	timeLabel: string;
	durationLabel?: string;
}) {
	return (
		<Card
			className={`h-full transition-shadow hover:shadow-md ${cardBorderClass}`}
		>
			<CardActionArea
				component={Link}
				to={`/libraries/${activity.gameId}`}
				className="h-full p-3"
			>
				<Box className="flex h-full items-start gap-3">
					<Avatar
						variant="rounded"
						src={activity.imageUrl}
						alt={activity.gameTitle}
						className="h-14 w-14 shrink-0"
					/>
					<Box className="min-w-0 flex-1">
						<Typography
							variant="subtitle2"
							className="font-bold"
							sx={twoLineTextSx}
						>
							{activity.type === "add" ? addedLabel : playedLabel}
						</Typography>
						<Typography
							variant="caption"
							color="text.secondary"
							className="mt-0.5 block truncate"
						>
							{timeLabel}
						</Typography>
						{durationLabel && (
							<Chip
								size="small"
								label={durationLabel}
								className="mt-2 max-w-full"
								sx={{ height: 24 }}
							/>
						)}
					</Box>
				</Box>
			</CardActionArea>
		</Card>
	);
}

function GameCardSkeletonGrid({ count }: { count: number }) {
	return (
		<>
			{gameCardSkeletonKeys.slice(0, count).map((key) => (
				<Card key={key} className={`overflow-hidden ${cardBorderClass}`}>
					<Skeleton variant="rectangular" className="aspect-[3/4]" />
					<Box className="p-3">
						<Skeleton height={22} />
						<Skeleton width="70%" height={18} />
					</Box>
				</Card>
			))}
		</>
	);
}

function ActivitySkeletonGrid({ count }: { count: number }) {
	return (
		<>
			{activitySkeletonKeys.slice(0, count).map((key) => (
				<Card key={key} className={cardBorderClass}>
					<Box className="flex items-center gap-3 p-3">
						<Skeleton variant="rounded" width={56} height={56} />
						<Box className="min-w-0 flex-1">
							<Skeleton height={22} />
							<Skeleton width="65%" height={18} />
						</Box>
					</Box>
				</Card>
			))}
		</>
	);
}

function RepositorySummaryCard({
	games,
	totalGames,
	localGames,
	completedGames,
	openAddModal,
}: {
	games: GamePreview[];
	totalGames: number;
	localGames: number;
	completedGames: number;
	openAddModal: () => void;
}) {
	const { t } = useTranslation();
	const previewGridRef = useRef<HTMLDivElement | null>(null);
	const [previewColumnCount, setPreviewColumnCount] = useState(5);
	const previewGames = games.slice(
		0,
		getRepositoryPreviewLimit(previewColumnCount),
	);

	useEffect(() => {
		const element = previewGridRef.current;
		if (!element || typeof ResizeObserver === "undefined") return;

		const updateColumnCount = () => {
			const nextColumnCount = getRepositoryPreviewColumnCount(element);
			setPreviewColumnCount((currentColumnCount) =>
				currentColumnCount === nextColumnCount
					? currentColumnCount
					: nextColumnCount,
			);
		};

		updateColumnCount();
		const resizeObserver = new ResizeObserver(updateColumnCount);
		resizeObserver.observe(element);
		return () => resizeObserver.disconnect();
	}, []);

	return (
		<Card className={`h-full overflow-hidden ${cardBorderClass}`}>
			<CardContent className="h-full flex flex-col gap-4">
				<Box className="flex items-start gap-3">
					<Box className="h-11 w-11 shrink-0 flex items-center justify-center rounded-3 bg-[--mui-palette-action-hover] text-amber-500">
						<RepositoryIcon />
					</Box>
					<Box className="min-w-0">
						<Typography variant="h6" className="font-bold">
							{t("home.repository", "游戏仓库")}
						</Typography>
						<Typography color="text.secondary" variant="body2">
							{t(
								"home.repositorySummary",
								"共 {{count}} 个游戏 · {{local}} 个本地 · {{completed}} 个通关",
								{
									count: totalGames,
									local: localGames,
									completed: completedGames,
								},
							)}
						</Typography>
					</Box>
				</Box>

				<Box
					ref={previewGridRef}
					className="grid gap-2 overflow-hidden"
					sx={{
						gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
					}}
				>
					{previewGames.map((game) => (
						<Tooltip key={game.id} title={game.title} enterDelay={1000}>
							<CardActionArea
								component={Link}
								to={`/libraries/${game.id}`}
								aria-label={game.title}
								className="aspect-[2/3] w-full min-w-0 overflow-hidden rounded-2"
							>
								<Box
									component="img"
									src={game.imageUrl}
									alt={game.title}
									draggable={false}
									loading="lazy"
									className="h-full w-full object-cover transition-transform duration-200 hover:scale-103"
								/>
							</CardActionArea>
						</Tooltip>
					))}
				</Box>

				<Box className="mt-auto flex flex-wrap gap-2">
					<Button
						component={Link}
						to="/libraries"
						variant="contained"
						endIcon={<ArrowForwardIcon />}
					>
						{t("home.viewLibrary", "查看仓库")}
					</Button>
					<Button
						variant="outlined"
						startIcon={<RecentlyAddedIcon />}
						onClick={openAddModal}
					>
						{t("components.AddModal.addGame", "添加游戏")}
					</Button>
				</Box>
			</CardContent>
		</Card>
	);
}

function HomeLoadingCards() {
	return (
		<Box className="grid grid-cols-12 gap-5">
			<Box className="col-span-12 lg:col-span-4">
				<Card className={`h-full ${cardBorderClass}`}>
					<CardContent>
						<Skeleton width="45%" height={32} />
						<Skeleton width="80%" />
						<Box
							className="mt-4 grid gap-2"
							sx={{
								gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
							}}
						>
							{previewSkeletonKeys.map((key) => (
								<Skeleton
									key={key}
									variant="rounded"
									className="aspect-[2/3] w-full"
								/>
							))}
						</Box>
					</CardContent>
				</Card>
			</Box>
			<Box className="col-span-12 lg:col-span-8">
				<Box className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
					<GameCardSkeletonGrid count={4} />
				</Box>
			</Box>
		</Box>
	);
}

export const Home: React.FC = () => {
	const { index, isLoading: isGameIndexLoading } = useGameIndex();
	const displayAllGames = index.displayList;
	const openAddModal = useStore((state) => state.openAddModal);
	const {
		totalPlayTime,
		weekPlayTime,
		monthPlayTime,
		todayPlayTime,
		isLoading,
	} = usePlayTimeSummary();
	const [playTimePeriod, setPlayTimePeriod] = useState<"week" | "month">(
		"week",
	);
	const gameIds = useMemo(
		() => displayAllGames.map((game) => game.id),
		[displayAllGames],
	);
	const recentSessionsQuery = useRecentSessionsForGames(gameIds, 80);
	const activityData = useMemo(
		() => buildGameActivities(displayAllGames, recentSessionsQuery.data ?? []),
		[displayAllGames, recentSessionsQuery.data],
	);
	const isActivityLoading = recentSessionsQuery.isLoading;
	const { t } = useTranslation();

	const gamesList = useMemo(
		() =>
			displayAllGames.map((game) => ({
				title: getGameDisplayName(game),
				id: game.id,
				isLocal: !!game.localpath,
				imageUrl: getGameCover(game),
				createdAt: game.created_at,
			})),
		[displayAllGames],
	);
	const gamesLocalCount = useMemo(
		() => gamesList.filter((game) => game.isLocal).length,
		[gamesList],
	);
	const completedGamesCount = useMemo(
		() =>
			displayAllGames.filter((game) => game.clear === PlayStatus.PLAYED).length,
		[displayAllGames],
	);
	const isLibraryLoading = isGameIndexLoading && displayAllGames.length === 0;
	const isLibraryEmpty = !isGameIndexLoading && displayAllGames.length === 0;
	const isWeekPlayTime = playTimePeriod === "week";

	const statsCards: StatCardItem[] = useMemo(
		() => [
			{
				title: t("home.stats.totalGames", "总游戏数"),
				value: displayAllGames.length,
				icon: <GamesIcon />,
				isAsync: false,
				toneClassName: "text-sky-500",
			},
			{
				title: t("home.stats.localGames", "本地游戏数"),
				value: gamesLocalCount,
				icon: <LocalIcon />,
				isAsync: false,
				toneClassName: "text-emerald-500",
			},
			{
				title: t("home.stats.completedGames", "通关游戏数"),
				value: completedGamesCount,
				icon: <CompletedIcon />,
				isAsync: false,
				toneClassName: "text-amber-500",
			},
			{
				title: t("home.stats.totalPlayTime", "总游戏时长"),
				value: formatPlayTime(totalPlayTime),
				icon: <TimeIcon />,
				isAsync: true,
				toneClassName: "text-violet-500",
			},
			{
				title: isWeekPlayTime
					? t("home.stats.weekPlayTime", "本周游戏时长")
					: t("home.stats.monthPlayTime", "本月游戏时长"),
				value: formatPlayTime(isWeekPlayTime ? weekPlayTime : monthPlayTime),
				icon: isWeekPlayTime ? <WeekIcon /> : <MonthIcon />,
				isAsync: true,
				toneClassName: "text-orange-500",
				action: (
					<Tooltip
						title={
							isWeekPlayTime
								? t("home.stats.switchToMonth", "切换到本月")
								: t("home.stats.switchToWeek", "切换到本周")
						}
					>
						<IconButton
							size="small"
							aria-label={
								isWeekPlayTime
									? t("home.stats.switchToMonth", "切换到本月")
									: t("home.stats.switchToWeek", "切换到本周")
							}
							onClick={() =>
								setPlayTimePeriod(isWeekPlayTime ? "month" : "week")
							}
							className="absolute right-3 top-3"
						>
							<SwitchIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				),
			},
			{
				title: t("home.stats.todayPlayTime", "今日游戏时长"),
				value: formatPlayTime(todayPlayTime),
				icon: <TodayIcon />,
				isAsync: true,
				toneClassName: "text-rose-500",
			},
		],
		[
			t,
			displayAllGames.length,
			gamesLocalCount,
			completedGamesCount,
			totalPlayTime,
			weekPlayTime,
			monthPlayTime,
			todayPlayTime,
			isWeekPlayTime,
		],
	);

	const handleOpenAddModal = () => openAddModal("");

	return (
		<Box className="min-h-[calc(100dvh-64px)] p-4 sm:p-6 pt-4 flex flex-col gap-6">
			<Box className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<Box className="min-w-0">
					<Typography variant="h4" className="font-bold">
						{t("home.title", "主页")}
					</Typography>
					<Typography color="text.secondary" className="mt-1">
						{t("home.titleSummary", "仓库中共有 {{count}} 个游戏", {
							count: displayAllGames.length,
						})}
					</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<RecentlyAddedIcon />}
					onClick={handleOpenAddModal}
					className="self-start sm:self-auto"
				>
					{t("components.AddModal.addGame", "添加游戏")}
				</Button>
			</Box>

			<Box className="grid grid-cols-12 gap-4 xl:gap-5">
				{statsCards.map((card) => (
					<Box
						key={card.title}
						className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-2"
					>
						<StatCard card={card} isLoading={isLoading} />
					</Box>
				))}
			</Box>

			{isLibraryLoading ? (
				<HomeLoadingCards />
			) : isLibraryEmpty ? (
				<EmptyCard
					icon={<RepositoryIcon className="text-amber-500 text-5xl" />}
					message={t("components.Toolbar.Category.noGames", "暂无游戏")}
					action={
						<Button
							variant="contained"
							startIcon={<RecentlyAddedIcon />}
							onClick={handleOpenAddModal}
						>
							{t("components.AddModal.addGame", "添加游戏")}
						</Button>
					}
				/>
			) : (
				<>
					<Box className="grid grid-cols-12 gap-5">
						<Box className="col-span-12 lg:col-span-4">
							<RepositorySummaryCard
								games={gamesList}
								totalGames={displayAllGames.length}
								localGames={gamesLocalCount}
								completedGames={completedGamesCount}
								openAddModal={handleOpenAddModal}
							/>
						</Box>

						<Box className="col-span-12 lg:col-span-8">
							<SectionHeader
								icon={
									<RecentlyPlayedIcon className="text-[--mui-palette-primary-main]" />
								}
								title={t("home.recentlyPlayed", "最近游玩")}
								action={
									<Button
										component={Link}
										to="/libraries"
										size="small"
										endIcon={<ArrowForwardIcon />}
									>
										{t("home.viewAll", "查看全部")}
									</Button>
								}
							/>
							<Box className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
								{isActivityLoading ? (
									<GameCardSkeletonGrid count={4} />
								) : activityData.sessions.length > 0 ? (
									activityData.sessions.slice(0, 4).map((session) => (
										<GameCoverCard
											key={session.session_id}
											game={{
												id: session.game_id,
												title: session.gameTitle,
												imageUrl: session.imageUrl,
											}}
											meta={t("home.lastPlayed", "最后游玩: {{time}}", {
												time: formatRelativeTime(session.end_time),
											})}
											badge={
												session.duration
													? formatPlayTime(session.duration)
													: undefined
											}
										/>
									))
								) : (
									<Box className="col-span-full">
										<EmptyCard
											icon={
												<RecentlyPlayedIcon className="text-[--mui-palette-primary-main] text-4xl" />
											}
											message={t("home.emptyRecentPlayed", "暂无游玩记录")}
										/>
									</Box>
								)}
							</Box>
						</Box>
					</Box>

					<Box className="grid grid-cols-12 gap-5">
						<Box className="col-span-12 xl:col-span-7">
							<SectionHeader
								icon={<RecentlyAddedIcon className="text-emerald-500" />}
								title={t("home.recentlyAdded", "最近添加")}
							/>
							<Box className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
								{activityData.added.length > 0 ? (
									activityData.added.slice(0, 4).map((game) => (
										<GameCoverCard
											key={game.id}
											game={{
												id: game.id,
												title: game.title,
												imageUrl: game.imageUrl,
											}}
											meta={t("home.addedAt", "添加时间: {{time}}", {
												time: formatRelativeTime(game.time),
											})}
										/>
									))
								) : (
									<Box className="col-span-full">
										<EmptyCard
											icon={
												<RecentlyAddedIcon className="text-emerald-500 text-4xl" />
											}
											message={t("home.emptyRecentAdded", "暂无最近添加")}
										/>
									</Box>
								)}
							</Box>
						</Box>

						<Box className="col-span-12 xl:col-span-5">
							<SectionHeader
								icon={<ActivityIcon className="text-violet-500" />}
								title={t("home.activityTitle", "动态")}
							/>
							<Box
								className="max-h-[452px] overflow-y-auto pr-1"
								sx={{ scrollbarGutter: "stable" }}
							>
								<Box className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
									{isActivityLoading ? (
										<ActivitySkeletonGrid count={6} />
									) : activityData.activities.length > 0 ? (
										activityData.activities.map((activity) => (
											<ActivityCard
												key={activity.id}
												activity={activity}
												addedLabel={t(
													"home.activity.added",
													"添加了 {{title}}",
													{
														title: activity.gameTitle,
													},
												)}
												playedLabel={t(
													"home.activity.played",
													"游玩了 {{title}}",
													{
														title: activity.gameTitle,
													},
												)}
												timeLabel={
													activity.type === "add"
														? t("home.activity.addedAt", "添加于 {{time}}", {
																time: formatRelativeTime(activity.time),
															})
														: t(
																"home.activity.playedAtTime",
																"游玩于 {{time}}",
																{
																	time: formatRelativeTime(activity.time),
																},
															)
												}
												durationLabel={
													activity.type === "play" &&
													activity.duration !== undefined
														? t(
																"home.activity.duration",
																"游戏时长: {{duration}}",
																{
																	duration: formatPlayTime(activity.duration),
																},
															)
														: undefined
												}
											/>
										))
									) : (
										<EmptyCard
											icon={
												<ActivityIcon className="text-violet-500 text-4xl" />
											}
											message={t("home.emptyActivity", "暂无动态")}
										/>
									)}
								</Box>
							</Box>
						</Box>
					</Box>
				</>
			)}
		</Box>
	);
};
