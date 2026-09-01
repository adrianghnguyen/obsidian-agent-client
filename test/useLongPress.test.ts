// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLongPress } from "../src/hooks/useLongPress";

describe("useLongPress", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires onShort when released before threshold", () => {
		vi.useFakeTimers();
		const onShort = vi.fn();
		const onLong = vi.fn();
		const { result } = renderHook(() => useLongPress(onShort, onLong, 800));

		act(() => {
			result.current.onPointerDown({ button: 0 } as React.PointerEvent);
		});
		expect(onShort).not.toHaveBeenCalled();
		expect(onLong).not.toHaveBeenCalled();

		act(() => {
			result.current.onPointerUp({ button: 0 } as React.PointerEvent);
		});
		expect(onShort).toHaveBeenCalledTimes(1);
		expect(onLong).not.toHaveBeenCalled();
	});

	it("fires onLong when held past threshold and released", () => {
		vi.useFakeTimers();
		const onShort = vi.fn();
		const onLong = vi.fn();
		const { result } = renderHook(() => useLongPress(onShort, onLong, 800));

		act(() => {
			result.current.onPointerDown({ button: 0 } as React.PointerEvent);
		});
		expect(result.current.armed).toBe(false);

		// Advance past threshold
		act(() => {
			vi.advanceTimersByTime(800);
		});
		expect(result.current.armed).toBe(true);

		// Release
		act(() => {
			result.current.onPointerUp({ button: 0 } as React.PointerEvent);
		});
		expect(onLong).toHaveBeenCalledTimes(1);
		expect(onShort).not.toHaveBeenCalled();
		expect(result.current.armed).toBe(false);
	});

	it("cancels on pointer leave before threshold", () => {
		vi.useFakeTimers();
		const onShort = vi.fn();
		const onLong = vi.fn();
		const { result } = renderHook(() => useLongPress(onShort, onLong, 800));

		act(() => {
			result.current.onPointerDown({ button: 0 } as React.PointerEvent);
		});

		// Leave before threshold
		act(() => {
			result.current.onPointerLeave({ button: 0 } as React.PointerEvent);
		});

		// Advance past threshold (should not fire long)
		act(() => {
			vi.advanceTimersByTime(800);
		});
		expect(onLong).not.toHaveBeenCalled();
		expect(onShort).not.toHaveBeenCalled();
	});

	it("ignores non-primary button", () => {
		vi.useFakeTimers();
		const onShort = vi.fn();
		const onLong = vi.fn();
		const { result } = renderHook(() => useLongPress(onShort, onLong, 800));

		act(() => {
			result.current.onPointerDown({ button: 2 } as React.PointerEvent);
		});
		vi.advanceTimersByTime(800);
		expect(result.current.armed).toBe(false);
		expect(onLong).not.toHaveBeenCalled();
		expect(onShort).not.toHaveBeenCalled();

		act(() => {
			result.current.onPointerUp({ button: 2 } as React.PointerEvent);
		});
		expect(onShort).not.toHaveBeenCalled();
		expect(onLong).not.toHaveBeenCalled();
	});

	it("updates callbacks when they change", () => {
		vi.useFakeTimers();
		const onShort1 = vi.fn();
		const onLong1 = vi.fn();
		const { result, rerender } = renderHook(
			({ onShort, onLong }: { onShort: () => void; onLong: () => void }) =>
				useLongPress(onShort, onLong, 800),
			{ initialProps: { onShort: onShort1, onLong: onLong1 } },
		);

		const onShort2 = vi.fn();
		const onLong2 = vi.fn();
		rerender({ onShort: onShort2, onLong: onLong2 });

		act(() => {
			result.current.onPointerDown({ button: 0 } as React.PointerEvent);
		});
		act(() => {
			vi.advanceTimersByTime(800);
		});
		act(() => {
			result.current.onPointerUp({ button: 0 } as React.PointerEvent);
		});

		expect(onLong1).not.toHaveBeenCalled();
		expect(onLong2).toHaveBeenCalledTimes(1);
		expect(onShort1).not.toHaveBeenCalled();
		expect(onShort2).not.toHaveBeenCalled();
	});

	it("sets armed to true after threshold", () => {
		vi.useFakeTimers();
		const onShort = vi.fn();
		const onLong = vi.fn();
		const { result } = renderHook(() => useLongPress(onShort, onLong, 800));

		expect(result.current.armed).toBe(false);

		act(() => {
			result.current.onPointerDown({ button: 0 } as React.PointerEvent);
		});
		expect(result.current.armed).toBe(false);

		act(() => {
			vi.advanceTimersByTime(800);
		});
		expect(result.current.armed).toBe(true);

		// Release resets
		act(() => {
			result.current.onPointerUp({ button: 0 } as React.PointerEvent);
		});
		expect(result.current.armed).toBe(false);
	});
});