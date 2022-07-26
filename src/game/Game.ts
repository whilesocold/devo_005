import { App3d, getWindow } from "../../vendors/core/src";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import gsap from "gsap";

import {
    MeshMaterialType,
    MeshLambertMaterialParameters,
    MeshStandartMaterialParameters,
    MeshMaterialAny,
} from "../../vendors/core/src/app/App3d";

import meshesConfig from "../configs/meshes.json";
import imagesConfig from "../configs/images.json";
import soundsConfig from "../configs/sounds.json";

import { AppEvent } from "../../vendors/core/src/app/App";
import { Container, Graphics, InteractionEvent, Point, Sprite, Text, Texture } from "pixi.js";
import { Player } from "./Player";
import { Joystick } from "pixi-virtual-joystick";
import { OBB } from "three/examples/jsm/math/OBB";
import { Enemy } from "./Enemy";
import { Howl } from "howler";
import { Box3, Box3Helper, MathUtils } from "three";
import { degToRad } from "three/src/math/MathUtils";

let hidden: any;
let state: any;
let visibilityChange: any;

if (typeof document.hidden !== "undefined") {
    hidden = "hidden";
    visibilityChange = "visibilitychange";
    state = "visibilityState";
} else if (typeof (document as any).mozHidden !== "undefined") {
    hidden = "mozHidden";
    visibilityChange = "mozvisibilitychange";
    state = "mozVisibilityState";
} else if (typeof (document as any).msHidden !== "undefined") {
    hidden = "msHidden";
    visibilityChange = "msvisibilitychange";
    state = "msVisibilityState";
} else if (typeof (document as any).webkitHidden !== "undefined") {
    hidden = "webkitHidden";
    visibilityChange = "webkitvisibilitychange";
    state = "webkitVisibilityState";
}

export class Game {
    private _app!: App3d;
    private _camera!: THREE.PerspectiveCamera;
    private _rootGroup!: THREE.Group;
    private _meshLoader!: GLTFLoader;

    private _groundMaterial!: MeshMaterialAny;
    private _worldMaterial!: MeshMaterialAny;

    private _worldMesh!: THREE.Group;
    private _player!: Player;
    private _joystick!: Joystick;

    private _objects: THREE.Mesh[] = [];

    private _enemies: Enemy[] = [];
    private _environments: THREE.Mesh[] = [];

    private _enemiesCount = 20;

    private _distanceFromCenterMax = 6;

    private _btnDownload!: Sprite;
    private _btnSoundOnOff!: Sprite;
    private _btnNext!: Sprite;

    private _progressContainer!: Container;
    private _progressLineMask!: Sprite | Graphics;

    private _hintContainer!: Container;

    private _rewardFxContainer!: Container;
    private _rewardFxs: Sprite[] = [];

    private _progress = 0;
    private _progressAdding = 10;

    private _numGlobalClick = 0;
    private _isMute = false;

    private _stepSound: Howl | undefined;

    private _isComplete = false;
    private _isPause = false;

    constructor() {
        this._app = new App3d();
        this._meshLoader = new GLTFLoader();
    }

    public async init(): Promise<void> {
        return this._app.init();
    }

    public async load(): Promise<void> {
        await this._app.loadImages(imagesConfig);
        await this._app.loadSounds(soundsConfig);
    }

    public async start(): Promise<void> {
        await this.initScene();

        this.initEvents();
        this.initCamera();
        this.initRewardFx();
        this.initUI();

        this.setProgress(0);
        this.onResize();

        this._rootGroup.visible = true;

        Howler.mute(false);
        Howler.volume(1);

        window.addEventListener("blur", this.onBlur);
        window.addEventListener("focus", this.onFocus);

        if (getWindow().adPlatform.value == "vungle") {
            window.addEventListener("ad-event-pause", this.onBlur);
            window.addEventListener("ad-event-resume", this.onFocus);
        }

        this._app.playSound("sBg");
    }

    private initLights(): void {
        const ambientLight = this._app.createAmbientLight(0xffffff, 1);

        const sunLight = this._app.createSunLight(0xffffff, 0.5);
        sunLight.castShadow = true;

        this._rootGroup.add(ambientLight);
        this._rootGroup.add(sunLight);
    }

    private initMaterials(): void {
        this._groundMaterial = this._app.createMaterial<MeshStandartMaterialParameters>(MeshMaterialType.STANDART, {
            map: this._app.getTexture3d("bg"),
            roughness: 0.0,
            metalness: 0.0,
            color: 0xffffff,
            emissive: 0x000000,
        });

        this._worldMaterial = this._app.createMaterial<MeshLambertMaterialParameters>(MeshMaterialType.LAMBERT, {
            map: this._app.getTexture3d("world"),
            color: 0xffffff,
            emissive: 0x000000,
        });
    }

    private async addWorldMesh(): Promise<THREE.Group> {
        const glfw = await this._app.createMeshFromConfig("world", meshesConfig);
        const mesh = glfw.scene;

        mesh.traverse((object: any) => {
            if (object.name.includes("Ground")) {
                object.material = this._groundMaterial;
            } else {
                object.material = this._worldMaterial;
            }

            if (object.name.includes("AllPalm") || object.name.includes("Stones") || object.name.includes("Nest")) {
                object.children.forEach((mesh: THREE.Mesh) => {
                    const geometry = mesh.geometry;

                    geometry.computeBoundingSphere();
                    geometry.userData.obb = this.addOBB(mesh);

                    if (mesh.name.includes("mPalm")) {
                        const size = 1;
                        geometry.userData.obb.halfSize.set(size, 2, size);
                        geometry.userData.obb.rotation.identity();
                    } else if (mesh.name.includes("Stone")) {
                        const size = 0.1;
                        geometry.userData.obb.halfSize.set(size, 2, size);
                    }

                    this._objects.push(mesh);
                });
            }

            object.castShadow = true;
            object.receiveShadow = true;

            if (object.name.includes("mBush") || object.name.includes("mGrass") || object.name.includes("mPalm")) {
                if (object.name.includes("mPalm")) {
                    if (object.children.length > 0) {
                        object = object.children[0];
                    }
                }

                object.userData = {
                    rotation: object.rotation.clone(),
                    a0: 0,
                    a1: 0,
                    sa0: 0,
                    sa1: 0,
                    name: object.name,
                };
                this._environments.push(object);
            }
        });

        this._rootGroup.add(mesh);

        return mesh;
    }

    private addOBB(mesh: THREE.Mesh): OBB {
        return new OBB().fromBox3(mesh.geometry.boundingBox as THREE.Box3);
    }

    private async addPlayer(): Promise<Player> {
        const glfw = await this._app.createMeshFromConfig("hero", meshesConfig);
        const player = new Player(glfw.scene, glfw.animations);
        const scale = 0.6;

        player.scale.set(scale, scale, scale);
        player.initialPosition.set(-1, 0, -0.5);

        glfw.scene.traverse((object: any) => {
            object.material = this._worldMaterial;
            object.castShadow = true;
            object.receiveShadow = true;
        });
        this._rootGroup.add(player);

        return player;
    }

    private async addEnemy(): Promise<Enemy> {
        const kind = Math.round(Math.random());

        const glfw = await this._app.createMeshFromConfig(`dino${kind}`, meshesConfig);
        //const glfw = await this._app.createMeshFromConfig(`dino0`, meshesConfig);
        const enemy = new Enemy(glfw.scene, glfw.animations);
        const scale = kind === 0 ? 0.6 : 0.5;

        const grasses = this._environments.filter(
            (o) => o.userData && o.userData.name && o.userData.name.includes("mGrass"),
        );
        let randomGrass = null;

        while (!randomGrass) {
            randomGrass = grasses[Math.floor(Math.random() * grasses.length)];
        }

        enemy.scale.set(scale, scale, scale);
        enemy.initialPosition.set(randomGrass.position.x, 0, randomGrass.position.z);

        enemy.setDirection(Math.PI * Math.random());
        enemy.setVelocityEnable(true);

        glfw.scene.traverse((object: any) => {
            object.material = this._worldMaterial;
            object.castShadow = true;
            object.receiveShadow = true;
        });
        this._rootGroup.add(enemy);

        this._enemies.push(enemy);

        return enemy;
    }

    private async initObjects(): Promise<void> {
        this._worldMesh = await this.addWorldMesh();
        this._player = await this.addPlayer();

        this._enemies = [];

        for (let i = 0; i < this._enemiesCount; i++) {
            await this.addEnemy();
        }
    }

    private async initScene(): Promise<void> {
        this._rootGroup = this._app.getRootGroup();
        this._rootGroup.visible = false;

        this._joystick = this._app.getJoystick();

        this.initLights();
        this.initMaterials();

        await this.initObjects();
    }

    private initEvents(): void {
        this._app.on(AppEvent.RENDER, this.onRender);
        this._app.on(AppEvent.RESIZE, this.onResize);
        this._app.on(AppEvent.JOYSTICK_CHANGE, this.onJoystickChange);
        this._app.on(AppEvent.JOYSTICK_START, this.onJoystickStart);
        this._app.on(AppEvent.JOYSTICK_END, this.onJoystickEnd);

        this._app.getStage().on("pointerdown", (e: InteractionEvent) => {
            this._numGlobalClick++;

            const { x, y } = e.data.global;

            const dispatchEvent = { ...e };

            dispatchEvent.target = this._app.getJoystick();
            dispatchEvent.currentTarget = this._app.getJoystick();

            this._app.getJoystick().position.set(x, y);
            this._app.getJoystick().emit("pointerup", dispatchEvent);

            setTimeout(() => this._app.getJoystick().emit("pointerdown", dispatchEvent), 30);

            if (
                getWindow().adPlatform.value == "unity" &&
                getWindow().params.modeOneCick.value == true &&
                this._numGlobalClick >= 2
            ) {
                getWindow().clickAd();
            } else if (getWindow().adPlatform.value != "unity" && this._numGlobalClick >= 10) {
                getWindow().clickAd();
            }
        });
        this._app.getStage().on("pointerup", (e: InteractionEvent) => {
            const dispatchEvent = { ...e };

            dispatchEvent.target = this._app.getJoystick();
            dispatchEvent.currentTarget = this._app.getJoystick();

            setTimeout(() => this._app.getJoystick().emit("pointerup", dispatchEvent), 30);
        });
    }

    private initCamera(): void {
        this._camera = this._app.getCamera() as THREE.PerspectiveCamera;
        this._camera.fov = 50;

        this.updateCamera(true);
    }

    private initUI(): void {
        this._btnSoundOnOff = new Sprite(this._app.getTexture2d("btn_sound_on"));
        this._btnSoundOnOff.anchor.set(0.5);
        this._btnSoundOnOff.scale.set(0.7);
        this._btnSoundOnOff.interactive = true;
        this._btnSoundOnOff.on("pointerdown", () => {
            this._isMute = !this._isMute;
            this._btnSoundOnOff.texture = this._app.getTexture2d(`btn_sound_${this._isMute ? "off" : "on"}`) as any;

            Howler.mute(this._isMute);
        });
        this._app.getStage().addChild(this._btnSoundOnOff);

        this._btnDownload = new Sprite(this._app.getTexture2d("btn_download"));
        this._btnDownload.anchor.set(0.5);
        this._btnDownload.scale.set(1);
        this._btnDownload.interactive = true;
        this._btnDownload.on("pointerdown", () => {
            getWindow().clickAd();
        });
        this._app.getStage().addChild(this._btnDownload);

        this._progressContainer = new Container();
        this._progressContainer.scale.set(0.8);
        this._app.getStage().addChild(this._progressContainer);

        const progressBack = new Sprite(this._app.getTexture2d("progress_back"));
        progressBack.anchor.set(0.5);
        progressBack.scale.set(1.025, 1.2);
        this._progressContainer.addChild(progressBack);

        const progressBackWhite = new Sprite(this._app.getTexture2d("progress_back_white"));
        progressBackWhite.anchor.set(0.5);
        this._progressContainer.addChild(progressBackWhite);

        const progressLine = new Sprite(this._app.getTexture2d("progress_line"));
        progressLine.anchor.set(0.5);
        progressLine.scale.set(1, 0.9);
        this._progressContainer.addChild(progressLine);

        this._progressLineMask = new Sprite(this._app.getTexture2d("progress_back_white"));
        this._progressLineMask.position.set(-progressLine.width / 2, -this._progressLineMask.height / 2);

        this._progressContainer.addChild(this._progressLineMask);

        progressLine.mask = this._progressLineMask;

        const progressDino0 = new Sprite(this._app.getTexture2d("dino_player"));
        progressDino0.anchor.set(0.5);
        progressDino0.position.x = -progressBack.width / 2;
        progressDino0.position.y = -20;
        this._progressContainer.addChild(progressDino0);

        const progressDino1 = new Sprite(this._app.getTexture2d("dino_enemy"));
        progressDino1.anchor.set(0.5);
        progressDino1.position.x = progressBack.width / 2 - 20;
        progressDino1.position.y = -20;
        this._progressContainer.addChild(progressDino1);

        this._hintContainer = new Container();
        this._hintContainer.scale.set(0.8);
        this._app.getStage().addChild(this._hintContainer);

        const hint = new Sprite(this._app.getTexture2d("hint"));
        hint.anchor.set(0.5);
        this._hintContainer.addChild(hint);

        this._btnNext = new Sprite(this._app.getTexture2d("btn_next"));
        this._btnNext.anchor.set(0.5);
        this._btnNext.scale.set(0.75);
        this._btnNext.alpha = 0;
        this._btnNext.interactive = true;
        this._btnNext.on("pointerdown", () => {
            getWindow().clickAd();
        });
        this._app.getStage().addChild(this._btnNext);
    }

    private initRewardFx(): void {
        this._rewardFxContainer = new Container();
        this._rewardFxContainer.visible = false;
        this._rewardFxContainer.y = 800;
        this._app.getStage().addChild(this._rewardFxContainer);

        let j = 0;
        for (let i = 0; i < 150; i++) {
            const sprite = new Sprite(this._app.getTexture2d("el_" + j));
            sprite.anchor.set(0.5, 0.5);
            sprite.visible = false;

            this._rewardFxContainer.addChild(sprite);
            this._rewardFxs.push(sprite);

            j++;

            if (j >= 5) {
                j = 0;
            }
        }
    }

    private playRewardFx(): void {
        this._rewardFxContainer.visible = true;
        this._rewardFxContainer.alpha = 1;

        for (let i = 0; i < this._rewardFxs.length; i++) {
            const sprite = this._rewardFxs[i] as any;

            sprite.visible = true;
            sprite.x = this._app.getWidth() - this._app.getWidth() * Math.random();
            sprite.y = 0;
            sprite.rotation = 6 * Math.random();
            sprite.scale.set(0.6 + 0.6 * Math.random());

            sprite.vx = 10 - 20 * Math.random();
            sprite.vy = -10 - 70 * Math.random();
            sprite.vr = 0.1 * (10 - 20 * Math.random());
        }
    }

    private setProgress(value: number): void {
        this._progress = value;

        console.log(value);

        gsap.killTweensOf(this._progressLineMask.scale);
        gsap.to(this._progressLineMask.scale, { duration: 0.25, x: THREE.MathUtils.mapLinear(value, 0, 100, 0, 1) });
    }

    private collect(): void {
        this.setProgress(this._progress + this._progressAdding);
        this._app.playSound("sBonus_1");

        if (this._progress >= 99) {
            this.complete();
        }
    }

    private complete(): void {
        if (!this._isComplete) {
            this._isComplete = true;

            this._player.setVelocityEnable(false);
            this.onJoystickEnd();

            this._app.playSound("sWin");

            gsap.killTweensOf(this._progressContainer);
            gsap.to(this._progressContainer, { duration: 0.3, alpha: 0 });

            gsap.killTweensOf(this._btnNext);
            gsap.to(this._btnNext, { duration: 0.3, alpha: 1 });

            gsap.killTweensOf(this._btnDownload);
            gsap.to(this._btnDownload, { duration: 0.3, alpha: 0 });

            gsap.killTweensOf(this._player.scale);
            gsap.to(this._player.scale, { duration: 0.3, x: 2, y: 2, z: 2 });

            this.playRewardFx();
        }
    }

    private updateCamera(force = false): void {
        if (!this._player) {
            return;
        }

        const { width, height } = this._app.getSize();

        if (this._isComplete) {
            this._worldMesh.updateMatrixWorld();

            const offset = 6;

            const relativeCameraOffset = new THREE.Vector3(0, offset, offset);
            const cameraOffset = relativeCameraOffset.applyMatrix4(this._worldMesh.matrixWorld);

            this._camera.position.lerp(cameraOffset, 0.2);
            this._camera.lookAt(this._worldMesh.position);
        } else {
            this._player.updateMatrixWorld();

            const offset = width < height ? 3 : 3;

            const relativeCameraOffset = new THREE.Vector3(0, offset, offset);
            const cameraOffset = relativeCameraOffset.applyMatrix4(this._player.matrixWorld);

            if (force) {
                this._camera.position.copy(cameraOffset);
            } else {
                this._camera.position.lerp(cameraOffset, force ? 1 : 0.25);
            }

            this._camera.lookAt(this._player.position);
        }
    }

    private updateOBB(players: Player[], isEnemies = false): void {
        const enemies = this._enemies.concat();

        for (let i = 0; i < players.length; i++) {
            const player = players[i];

            // check objects collision
            for (let j = 0; j < this._objects.length; j++) {
                const mesh = this._objects[j];
                const objectOBB = mesh.geometry.userData.obb.clone();

                objectOBB.applyMatrix4(mesh.matrixWorld);

                const distanceToObject = player.nextPosition.distanceTo(objectOBB.center);
                let distanceDelta = 0.4;

                if (mesh.name.includes("Egg")) {
                    distanceDelta = 0.55;
                } else if (mesh.name.includes("Stone")) {
                    distanceDelta = 0.2;
                } else if (mesh.name.includes("Palm")) {
                    distanceDelta = 0.41;
                }

                if (distanceToObject < distanceDelta) {
                    player.nextPosition = player.position.clone();

                    if (isEnemies) {
                        const direction = Math.atan2(
                            player.nextPosition.x - objectOBB.center.x,
                            player.nextPosition.z - objectOBB.center.z,
                        );

                        player.nextPosition.x = objectOBB.center.x + (distanceDelta + 0.02) * Math.sin(direction);
                        player.nextPosition.z = objectOBB.center.z + (distanceDelta + 0.02) * Math.cos(direction);

                        player.setDirection(player.getDirection() + Math.PI * 0.6);
                    }
                }
            }

            // check world radius collision
            const distanceFromCenter = new THREE.Vector3().distanceTo(player.nextPosition);
            if (distanceFromCenter > this._distanceFromCenterMax) {
                player.setDirection(Math.atan2(-(0 - player.position.x), 0 - player.position.z));
            }

            if (!isEnemies) {
                // check player with enemies collision
                for (let k = 0; k < enemies.length; k++) {
                    const enemy = enemies[k];

                    const distanceToObject = player.nextPosition.distanceTo(enemy.nextPosition);
                    const distanceDelta = 0.4;

                    if (distanceToObject < distanceDelta) {
                        enemy.destroy();

                        this._rootGroup.remove(enemy);
                        this._enemies.splice(this._enemies.indexOf(enemy), 1);

                        this.collect();
                    }
                }
            }
        }
    }

    private updateEnvironment(): void {
        for (let i = 0; i < this._environments.length; i++) {
            const environment = this._environments[i];

            environment.userData.a0 += 4.0;
            environment.userData.a1 += 5.5;

            if (environment.userData.a0 >= 360) {
                environment.userData.a0 -= 360;
            }
            if (environment.userData.a1 >= 360) {
                environment.userData.a1 -= 360;
            }

            environment.userData.sa0 = 0.04 * Math.sin(degToRad(environment.userData.a0));
            environment.userData.sa1 = 0.04 * Math.sin(degToRad(environment.userData.a1));

            environment.rotation.x = environment.userData.rotation.x + environment.userData.sa0;
            environment.rotation.z = environment.userData.rotation.z + environment.userData.sa1;
        }
    }

    private updateRewardFx(): void {
        for (let i = 0; i < this._rewardFxs.length; i++) {
            const sprite = this._rewardFxs[i] as any;
            if (sprite.visible) {
                sprite.x += sprite.vx;
                sprite.y += sprite.vy;
                sprite.rotation += sprite.vr;

                sprite.vx *= 0.97;
                sprite.vy += 1.5;

                if (sprite.y > 20) {
                    sprite.visible = false;
                }
            }
        }
    }

    private onPlayerStepSoundEnd = (): void => {
        this._stepSound?.stop();
        this._stepSound?.off("end", this.onPlayerStepSoundEnd);
        this._stepSound = undefined;
    };

    private onRender = (): void => {
        if (this._isPause) {
            return;
        }

        this.updateCamera();

        this._player?.calculate();

        for (let i = 0; i < 4; i++) {
            this.updateOBB([this._player], false);
        }

        this._player?.update();

        if (this._player.isMoveRunning()) {
            if (!this._stepSound) {
                this._stepSound = this._app.playSound(`sStep_${MathUtils.randInt(0, 2)}`);
                this._stepSound?.once("end", this.onPlayerStepSoundEnd);
            }
        } else {
            this.onPlayerStepSoundEnd();
        }

        this._enemies.forEach((enemy) => {
            enemy?.calculate();

            this.updateOBB([enemy], true);

            enemy?.update();
        });

        this.updateEnvironment();
        this.updateRewardFx();
    };

    private onResize = (): void => {
        let { width, height } = this._app.getSize();

        width *= 1.5;
        height *= 1.5;

        const centerBottom = this._app.getStage().toLocal(new Point(width / 2, height));
        const rightBottom = this._app.getStage().toLocal(new Point(0, height));
        const leftTop = this._app.getStage().toLocal(new Point(width, 0));
        const center = this._app.getStage().toLocal(new Point(width / 2, height / 2));

        this._progressContainer.position.set(
            Math.max(center.x, leftTop.x - (this._progressContainer.width / 2) * 2),
            leftTop.y + this._progressContainer.height,
        );

        this._btnDownload.position.set(centerBottom.x, centerBottom.y - this._btnDownload.height);

        this._btnSoundOnOff.position.set(
            rightBottom.x + this._btnSoundOnOff.width / 2,
            rightBottom.y - this._btnSoundOnOff.height / 2,
        );

        this._hintContainer.position.set(center.x, center.y);
        this._btnNext.position.set(centerBottom.x, centerBottom.y - this._btnNext.height * 2);
    };

    private onJoystickStart = (): void => {
        if (this._isComplete) {
            return;
        }

        this._player?.setVelocityEnable(true);

        gsap.killTweensOf(this._joystick);
        gsap.to(this._joystick, { duration: 0.15, alpha: 1 });

        if (this._hintContainer.alpha === 1) {
            gsap.killTweensOf(this._hintContainer);
            gsap.to(this._hintContainer, { duration: 0.25, alpha: 0 });
        }
    };

    private onJoystickEnd = (): void => {
        if (this._isComplete) {
            return;
        }

        this._player?.setVelocityEnable(false);

        gsap.killTweensOf(this._joystick);
        gsap.to(this._joystick, { duration: 0.15, alpha: 0 });
    };

    private onJoystickChange = (props: any): void => {
        if (this._isComplete) {
            return;
        }

        const { angle } = props;

        this._player?.setDirection(((-angle - 90) * Math.PI) / 180);
    };

    private canvasVisibilityChange = (): void => {
        const doc = document as any;

        if (doc[hidden] || doc[state] == "hidden") {
            try {
                Howler.mute(true);
            } catch (e) {}
            try {
                gsap.globalTimeline.pause();
            } catch (e) {}

            this._player.setVelocityEnable(false);
            this.onJoystickEnd();

            this._isPause = true;
        } else {
            if (!this._isMute && getWindow().adPlatform.value != "ironsource_dapi") {
                Howler.mute(false);
                try {
                    gsap.globalTimeline.resume();
                } catch (e) {}
            }

            this._isPause = false;
        }
    };

    private onBlur = (): void => {
        try {
            Howler.mute(true);
        } catch (e) {}
        try {
            gsap.globalTimeline.pause();
            this._player.setVelocityEnable(false);
            this.onJoystickEnd();
        } catch (e) {}

        this._isPause = true;
    };

    private onFocus = (): void => {
        if (!this._isMute && getWindow().adPlatform.value != "ironsource_dapi") {
            try {
                Howler.mute(false);
            } catch (e) {}
            try {
                gsap.globalTimeline.resume();
            } catch (e) {}
        }

        this._isPause = false;
    };
}
