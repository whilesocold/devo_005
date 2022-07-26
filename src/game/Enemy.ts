import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB";
import { Player } from "./Player";

export class Enemy extends Player {
    constructor(group: THREE.Group, animations: THREE.AnimationClip[]) {
        super(group, animations);

        this._toVelocityMax = 0.01;
        this._toDirectionAlpha = 0.15;
    }

    protected findMesh(): THREE.SkinnedMesh {
        return this._group.children[0].children[1] as THREE.SkinnedMesh;
    }
}
