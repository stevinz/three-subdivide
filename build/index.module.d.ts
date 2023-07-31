import { BufferGeometry } from 'three';

declare type ModifyParams = {
    split?: boolean
    uvSmooth?: boolean
    preserveEdges?: boolean
    flatOnly?: boolean
    maxTriangles?: number
    weight?: number
}

declare class LoopSubdivision {
    static modify(bufferGeometry: BufferGeometry, iterations: number = 1, params: ModifyParams = {}): BufferGeometry
}

export { LoopSubdivision, ModifyParams };
