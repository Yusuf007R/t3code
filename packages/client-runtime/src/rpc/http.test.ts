import {
  EnvironmentHttpBadRequestError,
  EnvironmentHttpConflictError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpInternalServerError,
  EnvironmentHttpUnauthorizedError,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { executeEnvironmentHttpRequest } from "./http.ts";

describe("executeEnvironmentHttpRequest", () => {
  it.effect("preserves declared endpoint errors", () =>
    Effect.gen(function* () {
      const errors = [
        new EnvironmentHttpBadRequestError({ message: "bad request" }),
        new EnvironmentHttpUnauthorizedError({ message: "unauthorized" }),
        new EnvironmentHttpForbiddenError({ message: "forbidden" }),
        new EnvironmentHttpConflictError({ message: "conflict" }),
        new EnvironmentHttpInternalServerError({ message: "internal error" }),
      ];

      for (const error of errors) {
        const exit = yield* executeEnvironmentHttpRequest(
          "http://environment.test/api/example",
          1_000,
          Effect.fail(error),
        ).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.squash(exit.cause)).toBe(error);
        }
      }
    }),
  );
});
