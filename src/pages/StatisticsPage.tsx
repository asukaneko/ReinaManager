import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DataObjectIcon from "@mui/icons-material/DataObject";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import LocalActivityIcon from "@mui/icons-material/LocalActivity";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import TodayIcon from "@mui/icons-material/Today";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Alert,
	Avatar,
	Box,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Divider,
	LinearProgress,
	List,
	ListItem,
	ListItemAvatar,
	ListItemText,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
import { alpha, type Theme, useTheme } from "@mui/material/styles";
import { LineChart } from "@mui/x-charts/LineChart";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import { useAllGameStatisticsMap } from "@/hooks/queries/useStats";
import { getRuntimeSourceAdapter } from "@/metadata";
import { useStore } from "@/store/appStore";
import type { GameData, GameStatistics } from "@/types";
import { isSourceType } from "@/types";
import {
	ALL_PLAY_STATUSES,
	PLAY_STATUS_I18N_KEYS,
	PlayStatus,
} from "@/types/collection";
import { formatPlayTime, formatRelativeTime } from "@/utils/dateTime";
import { getGameCover, getGameDisplayName } from "@/utils/game/gameDisplay";
import {
	getDeveloperNames,
	UNKNOWN_DEVELOPER_KEY,
} from "@/utils/game/gameIndex";
import { getTagDisplayName } from "@/utils/game/tagTranslation";

const TREND_DAYS = 30;
const HEATMAP_WEEKS = 13;
const STALE_DAYS = 90;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_STATS_MAP = new Map<number, GameStatistics>();

interface DailyPoint {
	date: string;
	minutes: number;
	[key: string]: string | number;
}

interface HeatmapCell extends DailyPoint {
	level: number;
}

interface RankedGame {
	game: GameData;
	totalMinutes: number;
	sessionCount: number;
	lastPlayed?: number | null;
}

interface DistributionRow {
	key: string;
	label: string;
	value: number;
	secondaryValue?: number;
}

interface GlobalStatistics {
	totalGames: number;
	localGames: number;
	onlineOnlyGames: number;
	completedGames: number;
	activeGames: number;
	totalPlayTime: number;
	todayPlayTime: number;
	weekPlayTime: number;
	monthPlayTime: number;
	averagePlayTime: number;
	activeDays: number;
	currentStreak: number;
	longestStreak: number;
	completionRate: number;
	activeRate: number;
	dailyTrend: DailyPoint[];
	heatmapCells: HeatmapCell[];
	statusRows: DistributionRow[];
	sourceRows: DistributionRow[];
	developerRows: DistributionRow[];
	tagRows: DistributionRow[];
	topPlayedGames: RankedGame[];
	recentlyPlayedGames: RankedGame[];
	staleGames: RankedGame[];
	neverPlayedGames: GameData[];
}

function toDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeekMonday(date: Date): Date {
	const start = startOfDay(date);
	const day = start.getDay();
	const daysFromMonday = day === 0 ? 6 : day - 1;
	return addDays(start, -daysFromMonday);
}

function getStatsDailyRecords(stats: GameStatistics | undefined) {
	return Array.isArray(stats?.daily_stats) ? stats.daily_stats : [];
}

function addDistributionValue(
	map: Map<string, DistributionRow>,
	key: string,
	label: string,
	value: number,
	secondaryValue = 0,
) {
	const current = map.get(key);
	if (current) {
		current.value += value;
		current.secondaryValue = (current.secondaryValue ?? 0) + secondaryValue;
		return;
	}
	map.set(key, { key, label, value, secondaryValue });
}

function getSourceLabel(
	idType: string | null | undefined,
	t: ReturnType<typeof useTranslation>["t"],
): string {
	if (!idType) return t("pages.Statistics.source.unknown", "Unknown");
	if (isSourceType(idType)) return getRuntimeSourceAdapter(idType).label;
	if (idType === "mixed") return t("pages.Statistics.source.mixed", "Mixed");
	if (idType === "custom") return t("pages.Statistics.source.custom", "Custom");
	if (idType === "Whitecloud") return "WhiteCloud";
	return idType;
}

function formatPercent(value: number, total: number): string {
	if (total <= 0) return "0%";
	return `${Math.round((value / total) * 100)}%`;
}

function getRangePlayTime(
	dailyTotals: Map<string, number>,
	startDate: Date,
	endDate: Date,
) {
	let total = 0;
	for (
		let cursor = startOfDay(startDate);
		cursor <= endDate;
		cursor = addDays(cursor, 1)
	) {
		total += dailyTotals.get(toDateKey(cursor)) ?? 0;
	}
	return total;
}

function getStreaks(dailyTotals: Map<string, number>, today: Date) {
	const activeDates = Array.from(dailyTotals.entries())
		.filter(([, minutes]) => minutes > 0)
		.map(([date]) => date)
		.toSorted();

	let longestStreak = 0;
	let currentRun = 0;
	let previousDate: Date | null = null;

	for (const dateKey of activeDates) {
		const date = new Date(`${dateKey}T00:00:00`);
		if (
			previousDate &&
			Math.round((date.getTime() - previousDate.getTime()) / ONE_DAY_MS) === 1
		) {
			currentRun += 1;
		} else {
			currentRun = 1;
		}
		longestStreak = Math.max(longestStreak, currentRun);
		previousDate = date;
	}

	const activeSet = new Set(activeDates);
	let currentStreak = 0;
	for (
		let cursor = startOfDay(today);
		activeSet.has(toDateKey(cursor));
		cursor = addDays(cursor, -1)
	) {
		currentStreak += 1;
	}

	return { currentStreak, longestStreak };
}

function buildDailyTrend(
	dailyTotals: Map<string, number>,
	today: Date,
	days: number,
): DailyPoint[] {
	const result: DailyPoint[] = [];
	const startDate = addDays(today, -(days - 1));

	for (let i = 0; i < days; i++) {
		const date = addDays(startDate, i);
		const dateKey = toDateKey(date);
		result.push({
			date: dateKey,
			minutes: dailyTotals.get(dateKey) ?? 0,
		});
	}

	return result;
}

function buildHeatmap(
	dailyTotals: Map<string, number>,
	today: Date,
): HeatmapCell[] {
	const startDate = startOfWeekMonday(addDays(today, -(HEATMAP_WEEKS * 7 - 1)));
	const days =
		Math.ceil((today.getTime() - startDate.getTime()) / ONE_DAY_MS) + 1;
	const maxMinutes = Math.max(...Array.from(dailyTotals.values()), 0);
	const result: HeatmapCell[] = [];

	for (let i = 0; i < days; i++) {
		const date = addDays(startDate, i);
		const dateKey = toDateKey(date);
		const minutes = dailyTotals.get(dateKey) ?? 0;
		const level =
			minutes <= 0 || maxMinutes <= 0
				? 0
				: Math.min(4, Math.max(1, Math.ceil((minutes / maxMinutes) * 4)));
		result.push({ date: dateKey, minutes, level });
	}

	return result;
}

function buildGlobalStatistics(
	games: GameData[],
	statsMap: Map<number, GameStatistics>,
	t: ReturnType<typeof useTranslation>["t"],
	tagTranslation: boolean,
): GlobalStatistics {
	const today = startOfDay(new Date());
	const todayKey = toDateKey(today);
	const weekStart = startOfWeekMonday(today);
	const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
	const staleCutoffSeconds = Math.floor(
		addDays(today, -STALE_DAYS).getTime() / 1000,
	);
	const unknownDeveloper = t("category.unknownDeveloper", "Unknown Developer");

	const dailyTotals = new Map<string, number>();
	const statusMap = new Map<string, DistributionRow>();
	const sourceMap = new Map<string, DistributionRow>();
	const developerMap = new Map<string, DistributionRow>();
	const tagMap = new Map<string, DistributionRow>();
	const rankedGames: RankedGame[] = [];
	const neverPlayedGames: GameData[] = [];
	let localGames = 0;
	let completedGames = 0;
	let totalPlayTime = 0;
	let activeGames = 0;

	for (const status of ALL_PLAY_STATUSES) {
		statusMap.set(String(status), {
			key: String(status),
			label: t(PLAY_STATUS_I18N_KEYS[status]),
			value: 0,
			secondaryValue: 0,
		});
	}

	for (const game of games) {
		const stats = statsMap.get(game.id);
		const totalMinutes = stats?.total_time ?? 0;
		const sessionCount = stats?.session_count ?? 0;
		const playStatus = game.clear ?? PlayStatus.WISH;

		if (game.localpath) localGames += 1;
		if (playStatus === PlayStatus.PLAYED) completedGames += 1;
		if (totalMinutes > 0) activeGames += 1;
		totalPlayTime += totalMinutes;

		const statusRow = statusMap.get(String(playStatus));
		if (statusRow) {
			statusRow.value += 1;
			statusRow.secondaryValue = (statusRow.secondaryValue ?? 0) + totalMinutes;
		}

		addDistributionValue(
			sourceMap,
			game.id_type ?? "unknown",
			getSourceLabel(game.id_type, t),
			1,
			totalMinutes,
		);

		for (const developer of getDeveloperNames(
			game.developer,
			UNKNOWN_DEVELOPER_KEY,
		)) {
			const label =
				developer === UNKNOWN_DEVELOPER_KEY ? unknownDeveloper : developer;
			addDistributionValue(developerMap, developer, label, totalMinutes, 1);
		}

		for (const tag of game.tags ?? []) {
			addDistributionValue(
				tagMap,
				tag,
				getTagDisplayName(tag, tagTranslation),
				1,
				totalMinutes,
			);
		}

		for (const dailyStats of getStatsDailyRecords(stats)) {
			if (!dailyStats.date) continue;
			dailyTotals.set(
				dailyStats.date,
				(dailyTotals.get(dailyStats.date) ?? 0) + (dailyStats.playtime ?? 0),
			);
		}

		if (totalMinutes > 0 || sessionCount > 0 || stats?.last_played) {
			rankedGames.push({
				game,
				totalMinutes,
				sessionCount,
				lastPlayed: stats?.last_played,
			});
		} else {
			neverPlayedGames.push(game);
		}
	}

	const { currentStreak, longestStreak } = getStreaks(dailyTotals, today);
	const topPlayedGames = rankedGames
		.toSorted((a, b) => b.totalMinutes - a.totalMinutes)
		.slice(0, 8);
	const recentlyPlayedGames = rankedGames
		.filter((item) => item.lastPlayed)
		.toSorted((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
		.slice(0, 8);
	const staleGames = rankedGames
		.filter((item) => item.lastPlayed && item.lastPlayed < staleCutoffSeconds)
		.toSorted((a, b) => (a.lastPlayed ?? 0) - (b.lastPlayed ?? 0))
		.slice(0, 8);

	return {
		totalGames: games.length,
		localGames,
		onlineOnlyGames: games.length - localGames,
		completedGames,
		activeGames,
		totalPlayTime,
		todayPlayTime: dailyTotals.get(todayKey) ?? 0,
		weekPlayTime: getRangePlayTime(dailyTotals, weekStart, today),
		monthPlayTime: getRangePlayTime(dailyTotals, monthStart, today),
		averagePlayTime:
			activeGames > 0 ? Math.round(totalPlayTime / activeGames) : 0,
		activeDays: Array.from(dailyTotals.values()).filter(
			(minutes) => minutes > 0,
		).length,
		currentStreak,
		longestStreak,
		completionRate: games.length > 0 ? completedGames / games.length : 0,
		activeRate: games.length > 0 ? activeGames / games.length : 0,
		dailyTrend: buildDailyTrend(dailyTotals, today, TREND_DAYS),
		heatmapCells: buildHeatmap(dailyTotals, today),
		statusRows: Array.from(statusMap.values()),
		sourceRows: Array.from(sourceMap.values()).toSorted(
			(a, b) => b.value - a.value,
		),
		developerRows: Array.from(developerMap.values())
			.filter((row) => row.value > 0)
			.toSorted((a, b) => b.value - a.value)
			.slice(0, 8),
		tagRows: Array.from(tagMap.values())
			.toSorted((a, b) => b.value - a.value)
			.slice(0, 10),
		topPlayedGames,
		recentlyPlayedGames,
		staleGames,
		neverPlayedGames: neverPlayedGames.slice(0, 8),
	};
}

type MetricCardProps = {
	title: string;
	value: React.ReactNode;
	helper?: React.ReactNode;
	icon: React.ReactNode;
};

function MetricCard({ title, value, helper, icon }: MetricCardProps) {
	return (
		<Card className="h-full">
			<CardContent className="h-full">
				<Stack spacing={1.25}>
					<Stack direction="row" alignItems="center" spacing={1}>
						<Box color="primary.main" className="flex">
							{icon}
						</Box>
						<Typography variant="body2" color="text.secondary" noWrap>
							{title}
						</Typography>
					</Stack>
					<Typography variant="h5" component="div" className="font-semibold">
						{value}
					</Typography>
					{helper && (
						<Typography variant="caption" color="text.secondary">
							{helper}
						</Typography>
					)}
				</Stack>
			</CardContent>
		</Card>
	);
}

type DistributionPanelProps = {
	title: string;
	rows: DistributionRow[];
	valueSuffix?: string;
	secondaryFormatter?: (value: number) => string;
	emptyText: string;
};

function DistributionPanel({
	title,
	rows,
	valueSuffix = "",
	secondaryFormatter,
	emptyText,
}: DistributionPanelProps) {
	const maxValue = Math.max(...rows.map((row) => row.value), 0);

	return (
		<Card className="h-full">
			<CardContent className="h-full">
				<Typography variant="h6" className="font-semibold mb-3">
					{title}
				</Typography>
				{rows.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						{emptyText}
					</Typography>
				) : (
					<Stack spacing={1.5}>
						{rows.map((row) => (
							<Box key={row.key}>
								<Stack
									direction="row"
									justifyContent="space-between"
									spacing={2}
								>
									<Typography variant="body2" noWrap title={row.label}>
										{row.label}
									</Typography>
									<Typography
										variant="body2"
										color="text.secondary"
										className="shrink-0"
									>
										{row.value}
										{valueSuffix}
									</Typography>
								</Stack>
								<LinearProgress
									variant="determinate"
									value={maxValue > 0 ? (row.value / maxValue) * 100 : 0}
									sx={{ mt: 0.75, height: 6, borderRadius: 1 }}
								/>
								{secondaryFormatter && (
									<Typography variant="caption" color="text.secondary">
										{secondaryFormatter(row.secondaryValue ?? 0)}
									</Typography>
								)}
							</Box>
						))}
					</Stack>
				)}
			</CardContent>
		</Card>
	);
}

type RankedGameListProps = {
	title: string;
	rows: RankedGame[];
	emptyText: string;
	secondaryMode: "playtime" | "recent";
};

function RankedGameList({
	title,
	rows,
	emptyText,
	secondaryMode,
}: RankedGameListProps) {
	return (
		<Card className="h-full">
			<CardContent className="h-full">
				<Typography variant="h6" className="font-semibold mb-2">
					{title}
				</Typography>
				{rows.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						{emptyText}
					</Typography>
				) : (
					<List dense disablePadding>
						{rows.map((row, index) => (
							<Box key={row.game.id}>
								<ListItem
									disableGutters
									component={Link}
									to={`/libraries/${row.game.id}`}
									className="text-inherit decoration-none"
								>
									<ListItemAvatar>
										<Avatar
											variant="rounded"
											src={getGameCover(row.game)}
											alt={getGameDisplayName(row.game)}
										/>
									</ListItemAvatar>
									<ListItemText
										primary={getGameDisplayName(row.game)}
										secondary={
											secondaryMode === "playtime"
												? `${formatPlayTime(row.totalMinutes)} / ${row.sessionCount}`
												: row.lastPlayed
													? formatRelativeTime(row.lastPlayed)
													: "-"
										}
										primaryTypographyProps={{ noWrap: true }}
									/>
									<Chip
										size="small"
										label={index + 1}
										variant="outlined"
										className="ml-2"
									/>
								</ListItem>
								{index !== rows.length - 1 && <Divider component="li" />}
							</Box>
						))}
					</List>
				)}
			</CardContent>
		</Card>
	);
}

type SimpleGameListProps = {
	title: string;
	games: GameData[];
	emptyText: string;
};

function SimpleGameList({ title, games, emptyText }: SimpleGameListProps) {
	return (
		<Card className="h-full">
			<CardContent className="h-full">
				<Typography variant="h6" className="font-semibold mb-2">
					{title}
				</Typography>
				{games.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						{emptyText}
					</Typography>
				) : (
					<List dense disablePadding>
						{games.map((game, index) => (
							<Box key={game.id}>
								<ListItem
									disableGutters
									component={Link}
									to={`/libraries/${game.id}`}
									className="text-inherit decoration-none"
								>
									<ListItemAvatar>
										<Avatar
											variant="rounded"
											src={getGameCover(game)}
											alt={getGameDisplayName(game)}
										/>
									</ListItemAvatar>
									<ListItemText
										primary={getGameDisplayName(game)}
										secondary={game.date || "-"}
										primaryTypographyProps={{ noWrap: true }}
									/>
								</ListItem>
								{index !== games.length - 1 && <Divider component="li" />}
							</Box>
						))}
					</List>
				)}
			</CardContent>
		</Card>
	);
}

function getHeatmapColor(level: number, theme: Theme): string {
	switch (level) {
		case 1:
			return alpha(theme.palette.success.light, 0.45);
		case 2:
			return theme.palette.success.light;
		case 3:
			return theme.palette.success.main;
		case 4:
			return theme.palette.success.dark;
		default:
			return theme.palette.action.hover;
	}
}

export const Statistics: React.FC = () => {
	const { t } = useTranslation();
	const theme = useTheme();
	const tagTranslation = useStore((state) => state.tagTranslation);
	const { index, isLoading: isGamesLoading, isError, error } = useGameIndex();
	const statsQuery = useAllGameStatisticsMap();
	const games = index.displayList;

	const analytics = useMemo(
		() =>
			buildGlobalStatistics(
				games,
				statsQuery.data ?? EMPTY_STATS_MAP,
				t,
				tagTranslation,
			),
		[games, statsQuery.data, t, tagTranslation],
	);

	const isLoading = isGamesLoading || statsQuery.isLoading;
	const trendMax = Math.max(
		...analytics.dailyTrend.map((item) => item.minutes),
		0,
	);
	const dateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(t("common.locale", "en-US"), {
				month: "2-digit",
				day: "2-digit",
			}),
		[t],
	);

	if (isLoading) {
		return (
			<PageContainer title={t("pages.Statistics.title", "Statistics")}>
				<Box className="min-h-[50vh] flex items-center justify-center gap-3">
					<CircularProgress />
					<Typography>{t("pages.Detail.loading", "Loading...")}</Typography>
				</Box>
			</PageContainer>
		);
	}

	if (isError || statsQuery.isError) {
		return (
			<PageContainer title={t("pages.Statistics.title", "Statistics")}>
				<Alert severity="error">
					{String(error ?? statsQuery.error ?? t("errors.unknownError"))}
				</Alert>
			</PageContainer>
		);
	}

	return (
		<PageContainer
			title={t("pages.Statistics.title", "Statistics")}
			sx={{ maxWidth: "100% !important" }}
		>
			<Box className="p-2 space-y-5">
				<Box className="grid grid-cols-12 gap-4">
					<Box className="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2">
						<MetricCard
							title={t("pages.Statistics.metrics.totalGames", "Total Games")}
							value={analytics.totalGames}
							helper={`${analytics.localGames} ${t("pages.Statistics.metrics.local", "local")}`}
							icon={<SportsEsportsIcon />}
						/>
					</Box>
					<Box className="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2">
						<MetricCard
							title={t(
								"pages.Statistics.metrics.totalPlayTime",
								"Total Play Time",
							)}
							value={formatPlayTime(analytics.totalPlayTime)}
							helper={t("pages.Statistics.metrics.avgPerActive", {
								defaultValue: "Avg {{time}} / active game",
								time: formatPlayTime(analytics.averagePlayTime),
							})}
							icon={<AccessTimeIcon />}
						/>
					</Box>
					<Box className="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2">
						<MetricCard
							title={t("pages.Statistics.metrics.monthPlayTime", "This Month")}
							value={formatPlayTime(analytics.monthPlayTime)}
							helper={`${t("pages.Statistics.metrics.week", "Week")} ${formatPlayTime(analytics.weekPlayTime)}`}
							icon={<CalendarMonthIcon />}
						/>
					</Box>
					<Box className="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2">
						<MetricCard
							title={t("pages.Statistics.metrics.todayPlayTime", "Today")}
							value={formatPlayTime(analytics.todayPlayTime)}
							helper={`${analytics.activeDays} ${t("pages.Statistics.metrics.activeDays", "active days")}`}
							icon={<TodayIcon />}
						/>
					</Box>
					<Box className="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2">
						<MetricCard
							title={t("pages.Statistics.metrics.completionRate", "Completed")}
							value={formatPercent(
								analytics.completedGames,
								analytics.totalGames,
							)}
							helper={`${analytics.completedGames} / ${analytics.totalGames}`}
							icon={<CheckCircleIcon />}
						/>
					</Box>
					<Box className="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-2">
						<MetricCard
							title={t("pages.Statistics.metrics.streak", "Streak")}
							value={analytics.currentStreak}
							helper={t("pages.Statistics.metrics.longestStreak", {
								defaultValue: "Longest {{count}} days",
								count: analytics.longestStreak,
							})}
							icon={<LocalActivityIcon />}
						/>
					</Box>
				</Box>

				<Box className="grid grid-cols-12 gap-4">
					<Box className="col-span-12 xl:col-span-8">
						<Card className="h-full">
							<CardContent>
								<Stack
									direction="row"
									alignItems="center"
									justifyContent="space-between"
									spacing={2}
									className="mb-2"
								>
									<Stack direction="row" alignItems="center" spacing={1}>
										<TrendingUpIcon color="primary" />
										<Typography variant="h6" className="font-semibold">
											{t("pages.Statistics.sections.trend", "Last 30 Days")}
										</Typography>
									</Stack>
									<Chip
										size="small"
										variant="outlined"
										label={formatPlayTime(
											analytics.dailyTrend.reduce(
												(sum, item) => sum + item.minutes,
												0,
											),
										)}
									/>
								</Stack>
								<LineChart
									dataset={analytics.dailyTrend}
									xAxis={[
										{
											dataKey: "date",
											scaleType: "point",
											valueFormatter: (value) =>
												dateFormatter.format(new Date(`${value}T00:00:00`)),
										},
									]}
									yAxis={[
										{
											min: 0,
											max: trendMax === 0 ? 10 : undefined,
											tickMinStep: 1,
										},
									]}
									series={[
										{
											dataKey: "minutes",
											label: t("pages.Statistics.chart.playMinutes", "Minutes"),
											color: theme.palette.primary.main,
											showMark: false,
											area: true,
										},
									]}
									height={320}
									grid={{ vertical: false, horizontal: true }}
									margin={{ left: 56, right: 24, top: 24, bottom: 36 }}
								/>
							</CardContent>
						</Card>
					</Box>
					<Box className="col-span-12 xl:col-span-4">
						<Card className="h-full">
							<CardContent>
								<Stack direction="row" alignItems="center" spacing={1}>
									<QueryStatsIcon color="primary" />
									<Typography variant="h6" className="font-semibold">
										{t("pages.Statistics.sections.heatmap", "Activity Heatmap")}
									</Typography>
								</Stack>
								<Box
									className="grid grid-flow-col grid-rows-7 gap-1 mt-4 overflow-x-auto pb-1"
									sx={{
										gridAutoColumns: 14,
									}}
								>
									{analytics.heatmapCells.map((cell) => (
										<Tooltip
											key={cell.date}
											title={`${cell.date} / ${formatPlayTime(cell.minutes)}`}
										>
											<Box
												className="rounded-sm"
												sx={{
													width: 12,
													height: 12,
													backgroundColor: getHeatmapColor(cell.level, theme),
												}}
											/>
										</Tooltip>
									))}
								</Box>
								<Stack
									direction="row"
									justifyContent="space-between"
									className="mt-4"
								>
									<Typography variant="body2" color="text.secondary">
										{t("pages.Statistics.metrics.activeGames", {
											defaultValue: "{{count}} active games",
											count: analytics.activeGames,
										})}
									</Typography>
									<Typography variant="body2" color="text.secondary">
										{Math.round(analytics.activeRate * 100)}%
									</Typography>
								</Stack>
								<LinearProgress
									variant="determinate"
									value={analytics.activeRate * 100}
									sx={{ mt: 1, height: 8, borderRadius: 1 }}
								/>
							</CardContent>
						</Card>
					</Box>
				</Box>

				<Box className="grid grid-cols-12 gap-4">
					<Box className="col-span-12 md:col-span-6 xl:col-span-3">
						<DistributionPanel
							title={t("pages.Statistics.sections.playStatus", "Play Status")}
							rows={analytics.statusRows}
							emptyText={t("pages.Statistics.empty.noData", "No data")}
							secondaryFormatter={(minutes) => formatPlayTime(minutes)}
						/>
					</Box>
					<Box className="col-span-12 md:col-span-6 xl:col-span-3">
						<DistributionPanel
							title={t("pages.Statistics.sections.sources", "Data Sources")}
							rows={analytics.sourceRows}
							emptyText={t("pages.Statistics.empty.noData", "No data")}
							secondaryFormatter={(minutes) => formatPlayTime(minutes)}
						/>
					</Box>
					<Box className="col-span-12 md:col-span-6 xl:col-span-3">
						<DistributionPanel
							title={t("pages.Statistics.sections.developers", "Developers")}
							rows={analytics.developerRows}
							emptyText={t("pages.Statistics.empty.noData", "No data")}
							secondaryFormatter={(count) =>
								t("pages.Statistics.metrics.gameCount", {
									defaultValue: "{{count}} games",
									count,
								})
							}
						/>
					</Box>
					<Box className="col-span-12 md:col-span-6 xl:col-span-3">
						<DistributionPanel
							title={t("pages.Statistics.sections.tags", "Top Tags")}
							rows={analytics.tagRows}
							emptyText={t("pages.Statistics.empty.noData", "No data")}
							valueSuffix={t("pages.Statistics.metrics.gamesSuffix", " games")}
							secondaryFormatter={(minutes) => formatPlayTime(minutes)}
						/>
					</Box>
				</Box>

				<Box className="grid grid-cols-12 gap-4">
					<Box className="col-span-12 lg:col-span-4">
						<RankedGameList
							title={t("pages.Statistics.sections.topPlayed", "Top Played")}
							rows={analytics.topPlayedGames}
							emptyText={t(
								"pages.Statistics.empty.noPlayed",
								"No play records",
							)}
							secondaryMode="playtime"
						/>
					</Box>
					<Box className="col-span-12 lg:col-span-4">
						<RankedGameList
							title={t(
								"pages.Statistics.sections.recentlyPlayed",
								"Recently Played",
							)}
							rows={analytics.recentlyPlayedGames}
							emptyText={t(
								"pages.Statistics.empty.noPlayed",
								"No play records",
							)}
							secondaryMode="recent"
						/>
					</Box>
					<Box className="col-span-12 lg:col-span-4">
						<RankedGameList
							title={t(
								"pages.Statistics.sections.longUnplayed",
								"Long Unplayed",
							)}
							rows={analytics.staleGames}
							emptyText={t("pages.Statistics.empty.noStale", "No stale games")}
							secondaryMode="recent"
						/>
					</Box>
				</Box>

				<Box className="grid grid-cols-12 gap-4">
					<Box className="col-span-12 lg:col-span-6">
						<SimpleGameList
							title={t("pages.Statistics.sections.neverPlayed", "Never Played")}
							games={analytics.neverPlayedGames}
							emptyText={t(
								"pages.Statistics.empty.noNeverPlayed",
								"Every game has a play record",
							)}
						/>
					</Box>
					<Box className="col-span-12 lg:col-span-6">
						<Card className="h-full">
							<CardContent className="h-full">
								<Stack direction="row" alignItems="center" spacing={1}>
									<DonutLargeIcon color="primary" />
									<Typography variant="h6" className="font-semibold">
										{t(
											"pages.Statistics.sections.libraryHealth",
											"Library Mix",
										)}
									</Typography>
								</Stack>
								<Box className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
									{[
										{
											title: t(
												"pages.Statistics.metrics.onlineOnly",
												"Cloud Only",
											),
											value: analytics.onlineOnlyGames,
											icon: <FolderOffIcon fontSize="small" />,
										},
										{
											title: t(
												"pages.Statistics.metrics.withLocalPath",
												"Local Path",
											),
											value: analytics.localGames,
											icon: <DataObjectIcon fontSize="small" />,
										},
										{
											title: t(
												"pages.Statistics.metrics.completedGames",
												"Completed",
											),
											value: analytics.completedGames,
											icon: <EmojiEventsIcon fontSize="small" />,
										},
									].map((item) => (
										<Box
											key={item.title}
											className="rounded border border-solid p-3"
											sx={{ borderColor: "divider" }}
										>
											<Stack direction="row" alignItems="center" spacing={1}>
												<Box color="primary.main" className="flex">
													{item.icon}
												</Box>
												<Typography
													variant="body2"
													color="text.secondary"
													noWrap
												>
													{item.title}
												</Typography>
											</Stack>
											<Typography
												variant="h5"
												component="div"
												className="font-semibold mt-2"
											>
												{item.value}
											</Typography>
										</Box>
									))}
								</Box>
							</CardContent>
						</Card>
					</Box>
				</Box>
			</Box>
		</PageContainer>
	);
};
