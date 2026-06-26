import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "pathe";
import { getAppDataDirPath } from "@/services/fs/pathCache";
import { getFileExtension, selectImageFile } from "@/services/game/customCover";
import { fileService } from "@/services/invoke";
import { toError } from "@/utils/errors";

const LOCAL_COVER_TOKEN_RE = /^[a-z0-9]+_\d+$/i;
const FILE_PATH_RE = /^(?:[a-z]:[\\/]|\/|\\\\)/i;
const URL_RE = /^(?:https?:|data:|asset:|blob:)/i;

export { selectImageFile as selectCollectionCoverFile };

export const getCollectionCoverFolder = (collectionId: number): string => {
	return join(getAppDataDirPath(), "covers", `collection_${collectionId}`);
};

export const getCollectionCoverPath = (
	collectionId: number,
	icon: string,
): string => {
	return join(
		getCollectionCoverFolder(collectionId),
		`cover_${collectionId}_${icon}`,
	);
};

export const resolveCollectionCover = (
	collectionId: number,
	icon?: string | null,
): string | null => {
	if (!icon) return null;

	if (URL_RE.test(icon)) {
		return icon;
	}

	if (LOCAL_COVER_TOKEN_RE.test(icon)) {
		return convertFileSrc(getCollectionCoverPath(collectionId, icon));
	}

	if (FILE_PATH_RE.test(icon)) {
		return convertFileSrc(icon);
	}

	return null;
};

export const deleteCollectionCustomCover = async (
	collectionId: number,
	icon?: string | null,
): Promise<void> => {
	if (!icon || !LOCAL_COVER_TOKEN_RE.test(icon)) {
		return;
	}

	await fileService.deleteFile(getCollectionCoverPath(collectionId, icon));
};

export const uploadSelectedCollectionCover = async (
	collectionId: number,
	imagePath: string,
	currentIcon?: string | null,
): Promise<string> => {
	const extension = getFileExtension(imagePath);
	if (!extension) {
		throw new Error("Selected image has no file extension");
	}

	const token = `${extension}_${Date.now()}`;
	const targetPath = getCollectionCoverPath(collectionId, token);

	try {
		await deleteCollectionCustomCover(collectionId, currentIcon);
	} catch (error) {
		console.warn(
			`Failed to delete previous collection cover: ${toError(error).message}`,
		);
	}

	await fileService.copyFile(imagePath, targetPath);
	return token;
};
