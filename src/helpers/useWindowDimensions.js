import { useState, useEffect } from "react";

export default function useWindowDimensions() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const debounceResize = (_e) => {
      clearTimeout(debounceResize._timeout);
      debounceResize._timeout = setTimeout(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 100);
    };

    window.addEventListener("resize", debounceResize);
    return () => window.removeEventListener("resize", debounceResize);
  }, []);

  return dimensions;
}
