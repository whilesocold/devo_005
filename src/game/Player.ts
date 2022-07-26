import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB";
import { Enemy } from "./Enemy";

export enum PlayerState {
    IDLE = "Eat",
    WALK = "Walk",
    FINAL = "Final",
}

export class Player extends THREE.Group {
    protected _group!: THREE.Group;

    protected _mesh!: THREE.SkinnedMesh;
    protected _obb!: OBB;

    protected _animationMixer!: THREE.AnimationMixer;
    protected _animationActions!: Map<string, THREE.AnimationAction>;
    protected _animationActionsSpeed!: Map<string, number>;
    protected _animationAction: THREE.AnimationAction | undefined;

    protected _state = "";

    protected _direction = 0;
    protected _toDirection = Math.PI;
    protected _toDirectionAlpha = 0.4;

    protected _velocity = 0;
    protected _toVelocity = 0;
    protected _toVelocityMax = 0.03;
    protected _toVelocityAlpha = 0.6;

    protected _moveRunning = false;

    public nextPosition: THREE.Vector3 = new THREE.Vector3(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    public initialPosition: THREE.Vector3 = new THREE.Vector3();

    constructor(group: THREE.Group, animations: THREE.AnimationClip[]) {
        super();

        this._group = group;
        this.add(this._group);

        this._mesh = this.findMesh();
        this._mesh.geometry.computeBoundingBox();
        this._obb = new OBB().fromBox3(this._mesh.geometry.boundingBox as THREE.Box3);

        this._animationMixer = new THREE.AnimationMixer(this._group);

        this._animationActions = new Map<string, THREE.AnimationAction>();
        this._animationActionsSpeed = new Map<string, number>();

        for (let i = 0; i < animations.length; i++) {
            const animation = animations[i];
            const action = this._animationMixer.clipAction(animations[i]);

            action.clampWhenFinished = true;
            action.setLoop(THREE.LoopRepeat, Number.MAX_SAFE_INTEGER);

            this._animationActions.set(animation.name, action);
        }

        this._animationActionsSpeed.set(PlayerState.IDLE, 0.01);
        this._animationActionsSpeed.set(PlayerState.WALK, 0.05);

        this.calculate(true);
        this.setState(PlayerState.IDLE);
    }

    public destroy(): void {
        this._animationMixer.stopAllAction();
        this._animationActions.forEach((action) => action.reset());
        this._mesh.clear();
    }

    public setState(state: PlayerState): void {
        if (this._state !== state) {
            this._state = state;
            this._animationMixer.time = 0;

            if (this._animationAction) {
                this._animationAction.stop();
            }

            this._animationAction = this._animationActions.get(state);
            this._animationAction?.play();
        }
    }

    public setDirection(angle: number): void {
        this._toDirection = angle;
    }

    public getDirection(): number {
        return this._toDirection;
    }

    public getVelocity(): number {
        return this._velocity;
    }

    public setVelocityEnable(value: boolean): void {
        this._toVelocity = value ? this._toVelocityMax : 0;
        this._moveRunning = value;

        this.setState(value ? PlayerState.WALK : PlayerState.IDLE);
    }

    public isMoveRunning(): boolean {
        return this._moveRunning;
    }

    public resetVelocity(): void {
        this._velocity = 0;
    }

    public calculate(force = false): void {
        if (force) {
            this._direction = this._toDirection;
            this._velocity = this._toVelocity;
        } else {
            this._direction = this.angleLerp(this._direction, this._toDirection, this._toDirectionAlpha);
            this._velocity = THREE.MathUtils.lerp(this._velocity, this._toVelocity, this._toVelocityAlpha);

            if (this.nextPosition.x === Number.MAX_SAFE_INTEGER && this.nextPosition.y === Number.MAX_SAFE_INTEGER) {
                this.nextPosition = this.initialPosition.clone();
            }

            this.nextPosition.x -= this._velocity * Math.sin(this._direction);
            this.nextPosition.z += this._velocity * Math.cos(this._direction);
        }

        this._group.rotation.set(0, -this._direction, 0);
    }

    public update(): void {
        this.position.x = this.nextPosition.x;
        this.position.z = this.nextPosition.z;

        if (this._state && this._animationAction) {
            this._animationMixer.update(this._animationActionsSpeed.get(this._state) || 0.025);
        }
    }

    protected shortAngleDist(from: number, to: number): number {
        const max = Math.PI * 2;
        const delta = (to - from) % max;
        return ((2 * delta) % max) - delta;
    }

    protected angleLerp(from: number, to: number, time: number): number {
        return from + this.shortAngleDist(from, to) * time;
    }

    public getGroup(): THREE.Group {
        return this._group;
    }

    protected findMesh(): THREE.SkinnedMesh {
        return this._group.children[0].children[0].children[0].children[1] as THREE.SkinnedMesh;
    }

    public getMesh(): THREE.SkinnedMesh {
        return this._mesh;
    }

    public getOBB(): OBB {
        return this._obb;
    }
}
