import { BufferGeometry } from 'three';

export declare type ModifyParams = {
    split?: boolean
    uvSmooth?: boolean
    preserveEdges?: boolean
    flatOnly?: boolean
    maxTriangles?: number
    weight?: number
}

export declare class LoopSubdivision {
    static modify(bufferGeometry: BufferGeometry, iterations: number = 1, params: ModifyParams = {}): BufferGeometry
}
