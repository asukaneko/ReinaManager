/**
 * @file EntityCard 通用实体卡片组件
 * @description 统一的分组/分类卡片组件，支持删除和右键菜单
 * @module src/components/Collection/EntityCard
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import DeleteIcon from "@mui/icons-material/Delete";
import FolderIcon from "@mui/icons-material/Folder";
import ImageIcon from "@mui/icons-material/Image";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { memo, useState } from "react";
import { AlertConfirmBox } from "@/components/AlertBox";

interface EntityCardProps {
	/** 实体信息 */
	entity: {
		id: string | number;
		name: string;
		count: number;
	};
	/** 点击卡片回调 */
	onClick: () => void;
	/** 悬停提示 */
	title?: string;
	/** 卡片封面 */
	coverUrl?: string | null;
	/** 是否撑满父容器高度 */
	fillHeight?: boolean;
	/** 是否单行省略标题 */
	titleNoWrap?: boolean;
	/** 删除回调 */
	onDelete?: (id: string | number) => void;
	/** 设置封面回调 */
	onEditCover?: () => void;
	/** 设置封面按钮提示 */
	editCoverTitle?: string;
	/** 右键菜单回调 */
	onContextMenu?: (
		e: React.MouseEvent,
		id: string | number,
		name: string,
	) => void;
	/** 是否显示删除按钮 */
	showDelete?: boolean;
	/** 删除确认对话框标题 */
	deleteTitle: string;
	/** 删除确认对话框消息 */
	deleteMessage: string;
	/** 计数单位文本 */
	countLabel: string;
}

/**
 * 通用实体卡片组件
 * 用于分组和分类的统一展示
 */
export const EntityCard = memo<EntityCardProps>(
	({
		entity,
		onClick,
		title,
		coverUrl,
		fillHeight = false,
		titleNoWrap = false,
		onDelete,
		onEditCover,
		editCoverTitle,
		onContextMenu,
		showDelete = true,
		deleteTitle,
		deleteMessage,
		countLabel,
	}) => {
		const canDelete = Boolean(showDelete && onDelete);
		const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
		const [isDeleting, setIsDeleting] = useState(false);

		const handleDeleteClick = (e: React.MouseEvent) => {
			e.stopPropagation();
			setDeleteDialogOpen(true);
		};

		const handleEditCoverClick = (e: React.MouseEvent) => {
			e.stopPropagation();
			onEditCover?.();
		};

		const handleConfirmDelete = async () => {
			if (!onDelete) return;
			setIsDeleting(true);
			try {
				await onDelete(entity.id);
			} finally {
				setIsDeleting(false);
				setDeleteDialogOpen(false);
			}
		};

		const handleContextMenu = (e: React.MouseEvent) => {
			if (!onContextMenu) return;
			e.preventDefault();
			onContextMenu(e, entity.id, entity.name);
		};

		return (
			<Box
				sx={{
					position: "relative",
					...(fillHeight && { boxSizing: "border-box", height: "100%" }),
				}}
			>
				<Card
					className="group overflow-hidden"
					onContextMenu={handleContextMenu}
				>
					<CardActionArea
						onClick={onClick}
						title={title}
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "stretch",
						}}
					>
						<Box className="relative aspect-[3/4] w-full overflow-hidden">
							{coverUrl ? (
								<Box
									component="img"
									src={coverUrl}
									alt={entity.name}
									draggable="false"
									loading="lazy"
									className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-103"
								/>
							) : (
								<Box
									className="h-full w-full flex items-center justify-center"
									sx={{
										bgcolor: "action.hover",
										color: "text.secondary",
									}}
								>
									<FolderIcon sx={{ fontSize: 46, opacity: 0.72 }} />
								</Box>
							)}
							<Box className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
						</Box>
						<CardContent
							sx={{
								flexShrink: 0,
								minWidth: 0,
								px: 2,
								py: 1.5,
								"&:last-child": { pb: 1.5 },
							}}
						>
							<Typography
								variant="subtitle1"
								component="div"
								noWrap={titleNoWrap}
								sx={titleNoWrap ? { minWidth: 0 } : undefined}
							>
								{entity.name}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{entity.count} {countLabel}
							</Typography>
						</CardContent>
					</CardActionArea>
					{onEditCover && (
						<Tooltip title={editCoverTitle ?? ""} enterDelay={600}>
							<IconButton
								sx={{
									position: "absolute",
									top: 8,
									left: 8,
									zIndex: 2,
									bgcolor: "background.paper",
									color: "text.primary",
									opacity: 0,
									boxShadow: 1,
									transition: "opacity 120ms ease",
									".group:hover &": {
										opacity: 1,
									},
									"&:hover": {
										bgcolor: "primary.main",
										color: "primary.contrastText",
									},
								}}
								size="small"
								onClick={handleEditCoverClick}
							>
								<ImageIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					)}
					{canDelete && (
						<IconButton
							sx={{
								position: "absolute",
								top: 8,
								right: 8,
								zIndex: 2,
								"&:hover": {
									bgcolor: "error.light",
									color: "error.contrastText",
								},
							}}
							size="small"
							onClick={handleDeleteClick}
							disabled={isDeleting}
						>
							<DeleteIcon fontSize="small" />
						</IconButton>
					)}
				</Card>
				{canDelete && (
					<AlertConfirmBox
						open={deleteDialogOpen}
						setOpen={setDeleteDialogOpen}
						onConfirm={handleConfirmDelete}
						isLoading={isDeleting}
						title={deleteTitle}
						message={deleteMessage}
					/>
				)}
			</Box>
		);
	},
);

EntityCard.displayName = "EntityCard";
