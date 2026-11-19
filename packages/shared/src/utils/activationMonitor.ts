/**
 * Online Activation & Latent Subspace Alignment Monitor.
 *
 * Implements online Welford mean/covariance tracking, Gram-Schmidt orthogonalization,
 * power iteration for principal subspace extraction, and Grassmannian projection alignment
 * for transformer activation vectors and embedding drift telemetry.
 */

export interface SubspaceMetrics {
  dimension: number;
  sampleCount: number;
  subspaceRank: number;
  alignmentScore: number; // 0.0 (orthogonal) to 1.0 (identical subspace)
  isDriftDetected: boolean;
  threshold: number;
  eigenvalues: number[];
}

export class OnlineSubspaceMonitor {
  readonly dimension: number;
  readonly rank: number;
  readonly driftThreshold: number;

  private count: number = 0;
  private mean: Float64Array;
  private m2: Float64Array;
  private referenceSubspace: Float64Array[] | null = null;

  constructor(options: {
    dimension: number;
    rank?: number;
    driftThreshold?: number;
    referenceSubspace?: number[][];
  }) {
    if (!Number.isInteger(options.dimension) || options.dimension <= 0) {
      throw new Error(`Dimension must be a positive integer, got ${options.dimension}`);
    }
    this.dimension = options.dimension;
    this.rank = Math.min(options.rank ?? 3, this.dimension);
    if (this.rank <= 0) {
      throw new Error(`Rank must be a positive integer, got ${this.rank}`);
    }
    this.driftThreshold = options.driftThreshold ?? 0.8;

    this.mean = new Float64Array(this.dimension);
    this.m2 = new Float64Array(this.dimension * this.dimension);

    if (options.referenceSubspace) {
      this.setReferenceSubspace(options.referenceSubspace);
    }
  }

  get sampleCount(): number {
    return this.count;
  }

  /**
   * Set reference orthogonal basis vectors (rank x dimension).
   */
  setReferenceSubspace(basis: number[][]): void {
    if (basis.length !== this.rank) {
      throw new Error(`Reference subspace must have rank ${this.rank}, got ${basis.length}`);
    }
    const sanitized: Float64Array[] = [];
    for (let r = 0; r < this.rank; r++) {
      const vec = basis[r];
      if (vec.length !== this.dimension) {
        throw new Error(`Basis vector ${r} length ${vec.length} does not match dimension ${this.dimension}`);
      }
      sanitized.push(new Float64Array(vec));
    }
    this.referenceSubspace = this.orthonormalize(sanitized);
  }

  /**
   * Ingest a batch of continuous activation vectors.
   */
  update(vector: number[] | Float64Array): void {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }

    // Defensive NaN / Infinity check
    for (let i = 0; i < this.dimension; i++) {
      if (!Number.isFinite(vector[i])) {
        // Discard non-finite vector safely without corrupting covariance
        return;
      }
    }

    this.count++;
    const delta = new Float64Array(this.dimension);
    const delta2 = new Float64Array(this.dimension);

    for (let i = 0; i < this.dimension; i++) {
      delta[i] = vector[i] - this.mean[i];
      this.mean[i] += delta[i] / this.count;
      delta2[i] = vector[i] - this.mean[i];
    }

    // Update covariance accumulator M2 += delta * delta2^T
    const dim = this.dimension;
    for (let i = 0; i < dim; i++) {
      const di = delta[i];
      const rowOffset = i * dim;
      for (let j = 0; j < dim; j++) {
        this.m2[rowOffset + j] += di * delta2[j];
      }
    }
  }

  /**
   * Compute empirical covariance matrix.
   */
  getCovariance(): Float64Array {
    const dim = this.dimension;
    const cov = new Float64Array(dim * dim);
    if (this.count < 2) return cov;
    const factor = 1.0 / (this.count - 1);
    for (let i = 0; i < dim * dim; i++) {
      cov[i] = this.m2[i] * factor;
    }
    return cov;
  }

  /**
   * Gram-Schmidt Orthonormalization of a set of vectors.
   */
  private orthonormalize(vectors: Float64Array[]): Float64Array[] {
    const basis: Float64Array[] = [];
    const dim = this.dimension;

    for (let i = 0; i < vectors.length; i++) {
      const v = new Float64Array(vectors[i]);
      for (let j = 0; j < basis.length; j++) {
        const u = basis[j];
        let dot = 0.0;
        for (let d = 0; d < dim; d++) dot += v[d] * u[d];
        for (let d = 0; d < dim; d++) v[d] -= dot * u[d];
      }

      let norm = 0.0;
      for (let d = 0; d < dim; d++) norm += v[d] * v[d];
      norm = Math.sqrt(norm);

      if (norm > 1e-12) {
        for (let d = 0; d < dim; d++) v[d] /= norm;
        basis.push(v);
      } else {
        const fallback = new Float64Array(dim);
        fallback[i % dim] = 1.0;
        basis.push(fallback);
      }
    }
    return basis;
  }

  /**
   * Power iteration with deflation to find top-k eigenvectors of empirical covariance.
   */
  computePrincipalSubspace(maxIterations: number = 30): { basis: Float64Array[]; eigenvalues: number[] } {
    const dim = this.dimension;
    const cov = this.getCovariance();
    const basis: Float64Array[] = [];
    const eigenvalues: number[] = [];

    const A = new Float64Array(cov);

    for (let k = 0; k < this.rank; k++) {
      const v = new Float64Array(dim);
      for (let d = 0; d < dim; d++) {
        v[d] = Math.sin((k + 1) * (d + 1));
      }
      let norm = Math.hypot(...v);
      if (norm > 1e-12) {
        for (let d = 0; d < dim; d++) v[d] /= norm;
      }

      let lambda = 0.0;
      for (let iter = 0; iter < maxIterations; iter++) {
        const nextV = new Float64Array(dim);
        for (let i = 0; i < dim; i++) {
          let sum = 0.0;
          const rowOffset = i * dim;
          for (let j = 0; j < dim; j++) {
            sum += A[rowOffset + j] * v[j];
          }
          nextV[i] = sum;
        }

        for (let prev = 0; prev < basis.length; prev++) {
          const u = basis[prev];
          let dot = 0.0;
          for (let d = 0; d < dim; d++) dot += nextV[d] * u[d];
          for (let d = 0; d < dim; d++) nextV[d] -= dot * u[d];
        }

        let nextNorm = 0.0;
        for (let d = 0; d < dim; d++) nextNorm += nextV[d] * nextV[d];
        nextNorm = Math.sqrt(nextNorm);

        if (nextNorm < 1e-12) {
          lambda = 0.0;
          break;
        }

        lambda = nextNorm;
        for (let d = 0; d < dim; d++) v[d] = nextV[d] / nextNorm;
      }

      basis.push(v);
      eigenvalues.push(lambda);

      for (let i = 0; i < dim; i++) {
        const vi = v[i];
        const rowOffset = i * dim;
        for (let j = 0; j < dim; j++) {
          A[rowOffset + j] -= lambda * vi * v[j];
        }
      }
    }

    return { basis, eigenvalues };
  }

  /**
   * Evaluate subspace alignment against the reference subspace.
   */
  evaluateAlignment(): SubspaceMetrics {
    if (this.count < 2) {
      return {
        dimension: this.dimension,
        sampleCount: this.count,
        subspaceRank: this.rank,
        alignmentScore: 1.0,
        isDriftDetected: false,
        threshold: this.driftThreshold,
        eigenvalues: new Array(this.rank).fill(0),
      };
    }

    const { basis, eigenvalues } = this.computePrincipalSubspace();

    if (!this.referenceSubspace) {
      this.referenceSubspace = basis;
      return {
        dimension: this.dimension,
        sampleCount: this.count,
        subspaceRank: this.rank,
        alignmentScore: 1.0,
        isDriftDetected: false,
        threshold: this.driftThreshold,
        eigenvalues,
      };
    }

    const dim = this.dimension;
    let frobeniusSum = 0.0;

    for (let r1 = 0; r1 < this.rank; r1++) {
      const uRef = this.referenceSubspace[r1];
      for (let r2 = 0; r2 < this.rank; r2++) {
        const uObs = basis[r2];
        let dot = 0.0;
        for (let d = 0; d < dim; d++) {
          dot += uRef[d] * uObs[d];
        }
        frobeniusSum += dot * dot;
      }
    }

    const alignment = Math.min(1.0, Math.max(0.0, frobeniusSum / this.rank));
    const isDrift = alignment < this.driftThreshold;

    return {
      dimension: this.dimension,
      sampleCount: this.count,
      subspaceRank: this.rank,
      alignmentScore: alignment,
      isDriftDetected: isDrift,
      threshold: this.driftThreshold,
      eigenvalues,
    };
  }

  reset(): void {
    this.count = 0;
    this.mean.fill(0);
    this.m2.fill(0);
  }
}
