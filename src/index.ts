import { getWindow } from "../vendors/core/src";
import { Game } from "./game/Game";

declare const NAME: string;
declare const VERSION: string;
declare const USE_3D: string;

console.log(`${NAME} ${VERSION} ${USE_3D ? "3d" : ""}`);

export const game: Game = new Game();

getWindow().appInit = (): Promise<void> => {
    return game.init();
};

getWindow().appLoad = (): Promise<void> => {
    return game.load();
};

getWindow().appStart = (): void => {
    game.start();
};
