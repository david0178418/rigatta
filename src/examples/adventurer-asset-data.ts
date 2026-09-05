import type { ImageAsset } from '../domain/model.ts';

export const ADVENTURER_SOURCE_URL = 'https://kenney.nl/assets/platformer-characters';
export const ADVENTURER_SOURCE_ARCHIVE = 'kenney_platformer-characters.zip';

export type AdventurerAssetKey = 'bodyFront' | 'head' | 'arm' | 'hand' | 'leg';

export type AdventurerAssetData = Readonly<{
	width: number;
	height: number;
	bytes: Uint8Array;
}>;

const decodeBase64 = function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);

	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const sourceData = {
	bodyFront: {
		width: 39,
		height: 31,
		base64: 'iVBORw0KGgoAAAANSUhEUgAAACcAAAAfCAYAAABkitT1AAACGUlEQVR42u3WWUsCURgGYP9gN3XRTUFUFAVGlKm5hMtYU2ramDYWSQttF4JFUFG0XLRBVCCEBUF008/46h044jLqLMeK6OJlUDzfPPOdM+doOQy0kFp2JrtpIrmuxBaapZuDJL1dL3LP7lacsr42VYOlFg6Jx0QaCsSox+ajwXE/dyBgqC25e/TjckI79doDSgHeQAZDvM5h/TjZ01UswBOI8aU1nY5R/TjRNVCFMwvEOIw3jUOWvR1kHRvnAlSDmcIh2VAnjYpJ6nMKZUVdQYEKF7IpGBKeGDKOQ9i2MjKZKHtJtADVYKgxLMyRK56hjal+c7hIPFoEeqQVpTBD1gNWwtB9jEUNVg97KjecGlINiM/4nqGwNCprIFw7p4bEZl0KZLABj0iOyGLNsUgiGuCz5uoF60eISfR4klKujVAs/sQy7QdbjeHWpq2abmIm4pxUBWyIwxGGJ9N7M3k7R3f3d3R2eal5TEiSy16Oujg8CZ7ISCeA+nh/URLO7Oju4lLYWRuHqTTSMZZMdp/eXp8on38wXMNSOYWZmRGlvc1eY5pwaN9CxGt4+pqK+22gv49zf50K9kiaxsKyciw1Cn7niC6RJ7HaPJx3fo1s0ylNoHpQLjghvansWbj+qmllexU2UjP7FVccunR1e1Pc4Vn2jk9/Focz8bmQr4KxoJvfjkO3js4vaqJYMM3ftf40/5/7ifzj/iTuEzzOy0O1MBT9AAAALXRFWHRTb2Z0d2FyZQBieS5ibG9vZGR5LmNyeXB0by5pbWFnZS5QTkcyNEVuY29kZXKoBn/uAAAAAElFTkSuQmCC'
	},
	head: {
		width: 48,
		height: 54,
		base64: 'iVBORw0KGgoAAAANSUhEUgAAADAAAAA2CAYAAACBWxqaAAAFA0lEQVR42s1aa28TRxT1P+hP4CfwE/IlSDwSHNuh4RESPvQhWpWkUpWoQsJq1UgUoRiXVogPxSJqpaapiiKa5lXiECXi0QSreWCThuwueZUEMIgUq6jods+ka+2uZ9cz9vox0pFje/bOOXfvuTOL8fkqMIL79+86GgyGjwWDkWOhUFx/TRxvbCQe9O+UI4FATW1t7Vu+Sg1GuKGhDWSbg8G0E1kDRwMBajp4kA7V1VFgz56aipBuqqvbjQyLEDaTbjxwIIvQvn3xspP+vzQSIqT1edlMm4kbCO7dGy5nPQuRNrL9dn09l7QZh+rr0yWr/ZZAwK8TvyZK2iDulG2uAH0ufOMZaWSDmVHvDLLERTLOQ3MoRLjDnpSJqCENYHG7MWUB8YiFVloQeVwoS9zIejHEDSABLBk6h4L8gBqUzXqh5cIDYmW7logfYEw9661Qi9KRIY+2KGNSUVjurJsfQDybSf2WyZjVq5Jx84EBRz/I9HJLwIaGkpEHEN9Spjw/QFU1krf7wNEPsptSucjzfJBTSrJmLTd5AA3CzgFnL6P2Y7LdppzkeT4AsuUjs1Ghz5eiVYpuaDkCZM3r5SYlAySNKwCHs2qte97BzlTGCaP7hGXq/pP3WujK+U660x+l+ZFLFoz9cI56vzlDX3/+MZ083lTSDS3bRkXbZ0/kNG3f/5FI7RcGRHop5LDfnytA5LD2fvMR2k72SZE3ANFn2t9hBFoaA+wOffnpB+wzvBclj0R0nDxhroiYcAu9fLajIPJ2EcuT3+Z8h8/spWiGfX7OoU7EA+pUrCgBXqKr80ObgDxd6PSpd6uGPDDUc3ZHgM5baB+Y6OuuKgGoBss5CMfSUphX1iN2w6IV8zwAgJflmcDpOUDEvI9nvmOdBfuDmYRMywVRp+4D82MN83zwsguIyJoXBNEOnRZ2yh4P2ABB1A1mEShrywMNzwdu5kWwfD38lytflKzkNu99T7zHSaWazWsHT0Ck3Ob1VACebqR33swWYcQH+yjcfjiL2MXPiNIpcULaAA3+fNUSAzGzQ0SA+VykTPWUV8DGJLumaAH4d6GOUx/RK3VcbOEXSyx+cvauZfFb4wNEa3Gpkrg11m+JgZhs/L0uLgBjcmyINrV5sYVXRojevKbMq226dK6TLYzXzJMl6ZrOrN62xtBjssFJxBv1urOAjUeLBAjfBYhAlvRyUuZuUmZ9htV0IcbMqGM7MZ5pO+WplxZv3j/qaH4Bf2lJplRk4dfqEG2rE/RSm6KnWkIYz7W77BoQEl0LeKHcTDgKWFNTcUPEM23GJVs3WKkZc+14+niFXj5/wsXc9ARd773MMD7Ym70G8bAm7v6/6q/cdfH5mjofFxJgiDCC4RXB3YgDWxsquQ1715qZGuYnQb9LZiH4e0ubJXB0E3DNjZwINteWPRHgBHcB2oNwsQKApWSCEeXB3PN/unpBOjY4OgpYVZKtXggAvupqt2TaDnyvLv7hsYDlud1eCQCQ4a7OExbieF9I5rMClJTf9WcmLwUAi3N3WJ0bwPti4j18OO3+Y9+qmop4LcIrgJvQr5OryoNE1ZHXOeXNvnmsK6k2tCw3aMnf0yup2+QJ/pxWnNZB5qXIi46F0W5/8sZFKhbzv0XT9wbO76rI/w1aGL0QK1rAcLTVV8lxfyTahixKEx+NKrMj3TW+ahnI5MJwNJ6POOZUFXH7QD2DIA9e1vp/I7YCSLtOCLMAAAAtdEVYdFNvZnR3YXJlAGJ5LmJsb29kZHkuY3J5cHRvLmltYWdlLlBORzI0RW5jb2RlcqgGf+4AAAAASUVORK5CYII='
	},
	arm: {
		width: 18,
		height: 33,
		base64: 'iVBORw0KGgoAAAANSUhEUgAAABIAAAAhCAYAAADUIPtUAAAB6ElEQVR42q2W70rCUBjGdwdeQpfgJXQJ3kDghyCIsiKL/mylSImEZraKitJW9KWw0YdAiBCKjLLyQ32wYm6L/kBQCxKi0N52JubQs+FZO/B8GOz5nee879k5o6i6MTIbb6XZtQTNcuIYyykMy6XRsze80kI1MzpCSw6GXefH5zcAJwSlY5zbFIJmQwmMIHqZwsyS4DQUWXVSuJqQQLRUavoGECokKQi7RFRES6D6VFYgtVRxly0gZo7L6TrGpf8D+9uo9OxalMQ4OhOHwalF6JuIQScTgvbBQKKayGdkGp5eAW9oHnoC0YppwI9VJZFaMG2ThZehP8iCxx8xNRmC2rrHnCSmrtFJmIguwOZ2EvZSKchmM4ognDs0mJGJDs3A3CqnmTKZIyjcXcPz/W2DnsR8rwbyMEFeP8vlxSnWYKRHKZ/WQMVCyvkl7UNROoR3+Qxe5Zw1EBo/Iq+AtAt6fUsp+JQO4EM+hjf5Al5k/NIe5RufHsTXg4xUTa9IJwpK81C4qh0rJXHH3SyoqrKQTDccJ5+FZAspCAl7UpZEPmcLqCzyvbaArCzP8CJABbQFRNo903uuJPCiLSC16D5bQG/ClgP3yRCDmk2F3dmkqdSJouidpv5QcKlQI9TOuijSUe2gCk2YAX4Bhl5AhwN3R/cAAAAtdEVYdFNvZnR3YXJlAGJ5LmJsb29kZHkuY3J5cHRvLmltYWdlLlBORzI0RW5jb2RlcqgGf+4AAAAASUVORK5CYII='
	},
	hand: {
		width: 17,
		height: 15,
		base64: 'iVBORw0KGgoAAAANSUhEUgAAABEAAAAPCAYAAAACsSQRAAABJklEQVR42mNgQAJ3d8/kf3thSf/fu2v3/72/vv/P/XX+7+6u4mcgFjw5OS/++ekF7//eW////4ONKPjP/fXngYbW/76/zh6nAU9PzJ8PNOD/txurMAzAhqEurf95b60+xICT8+tBBgC9gVAEdM2LMwv/g8Rfn1v8/+OV5f+/31yN1UCwd5+cmv8epPjnrTWoXri77v+HS8vABsHwq7OL/n+5thJJzfr7YJeguwId/7qzFiyPbBjIdSDXgrwECVCgS3A5Fd1lINfCMMgQlDAhJjDR8b/769/DY+b7vbXy5BgCSkdwQ0D+IscQkOVwQ0AhTLIrgOkEJaGR4wp4gCJ5Zz6JYVGPNdmDTAaG9noiDJhPMBOCkjAw58aDDARFIXJ0Ag3Ix6UPANuJroS3iAmEAAAALXRFWHRTb2Z0d2FyZQBieS5ibG9vZGR5LmNyeXB0by5pbWFnZS5QTkcyNEVuY29kZXKoBn/uAAAAAElFTkSuQmCC'
	},
	leg: {
		width: 21,
		height: 23,
		base64: 'iVBORw0KGgoAAAANSUhEUgAAABUAAAAXCAYAAADk3wSdAAABBElEQVR42mNgQAN3d6/if3lmXfyrs+vnvzy7dv+rM+vPg2gIXt//4vQ6fwZSAMiw1+fWv39zfuN/fBhk0etT6+wJGvj67Pp6QoahY7wGg7xEqoFgQ4G+enZ0rTwDtjAkxsu4MCisMQwFhk8+uQbCDT65Vh81coA2UWooKD5QDKXUQKxBMHQMfXBw0X9K8d29C4aqoUsakv9TihfXJ6IaOjHb7z+luD/Th3RDp+cHouDZxSH/55aEwvGMgqD5KIYuroz4j4yXVUf9X1UXQxJeUhyEWqiQagA6XlEdNR+jQKHUUBBeXhv9fmVNVD1VDYW7uiZq/cw0F36qGgozmOqGgjBNDAUAbjmTeyoRJLgAAAAtdEVYdFNvZnR3YXJlAGJ5LmJsb29kZHkuY3J5cHRvLmltYWdlLlBORzI0RW5jb2RlcqgGf+4AAAAASUVORK5CYII='
	},
} as const;

export const adventurerAssetData = {
	bodyFront: {
		width: sourceData.bodyFront.width,
		height: sourceData.bodyFront.height,
		bytes: decodeBase64(sourceData.bodyFront.base64)
	},
	head: {
		width: sourceData.head.width,
		height: sourceData.head.height,
		bytes: decodeBase64(sourceData.head.base64)
	},
	arm: {
		width: sourceData.arm.width,
		height: sourceData.arm.height,
		bytes: decodeBase64(sourceData.arm.base64)
	},
	hand: {
		width: sourceData.hand.width,
		height: sourceData.hand.height,
		bytes: decodeBase64(sourceData.hand.base64)
	},
	leg: {
		width: sourceData.leg.width,
		height: sourceData.leg.height,
		bytes: decodeBase64(sourceData.leg.base64)
	},
} as const satisfies Readonly<Record<AdventurerAssetKey, AdventurerAssetData>>;

export const adventurerImageAssetFor = function adventurerImageAssetFor(
	key: AdventurerAssetKey,
	id: ImageAsset['id'],
	name: string,
	relativePath: string
): ImageAsset {
	const asset = adventurerAssetData[key];

	return {
		id,
		name,
		relativePath,
		mimeType: 'image/png',
		width: asset.width,
		height: asset.height
	};
};
