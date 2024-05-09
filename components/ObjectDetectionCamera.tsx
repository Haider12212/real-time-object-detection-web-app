import React, { useRef, useState, useEffect } from "react";
import {useContext } from "react";
import Webcam, { WebcamProps } from "react-webcam";
import { runModelUtils } from "../utils";
import { Tensor } from "onnxruntime-web";
import { CheckListContext } from "../utils/CheckListContext";

interface WebcamComponentProps {
  preprocess: (ctx: CanvasRenderingContext2D) => any;
  session: any; // Update with the correct type for session
  postprocess: (outputTensor: Tensor, inferenceTime: number, ctx: CanvasRenderingContext2D) => string | null;
  inferenceTime: number;
  changeModelResolution: () => void;
  modelName: string;
  checklistItems: string[];
}

const WebcamComponent: React.FC<WebcamComponentProps> = (props) => {
  const [inferenceTime, setInferenceTime] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [detectedItems, setDetectedItems] = useState<string[]>([]);
  const webcamRef = useRef<Webcam>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveDetection = useRef<boolean>(false);
  const [facingMode, setFacingMode] = useState<string>("environment");
  const originalSize = useRef<[number, number]>([0, 0]);
  const [newItem, setNewItem] = useState<string>("");
  const {checkList, setCheckList, checkListLength, setCheckListLength} = useContext(CheckListContext);


  const updateChecklist = (newItem: string) => {
    if (!checkList.includes(newItem)) {
      setCheckList([...checkList, newItem]);
      setCheckListLength(checkListLength + 1);
    }
  };

  

  useEffect(() => {
    console.log("Current Checklist Items:", checkList);
  }, [checkList]);
  

  const runModel = async (ctx: CanvasRenderingContext2D) => {
    const data = props.preprocess(ctx);
    let outputTensor: Tensor;
    let inferenceTime: number;
    [outputTensor, inferenceTime] = await runModelUtils.runModel(
      props.session,
      data
    );

    const detectedItem = props.postprocess(outputTensor, props.inferenceTime, ctx);
    if (detectedItem) {
      updateChecklist(detectedItem);
    }

    setInferenceTime(inferenceTime);
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewItem(e.target.value);
  };

  const handleAddItem = () => {
    if (newItem) {
      updateChecklist(newItem);
      setNewItem("");
    }
  };
  
  const capture = () => {
    const canvas = videoCanvasRef.current!;
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    if (facingMode === "user") {
      context.setTransform(-1, 0, 0, 1, canvas.width, 0);
    }

    context.drawImage(
      webcamRef.current!.video!,
      0,
      0,
      canvas.width,
      canvas.height
    );

    if (facingMode === "user") {
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    return context;
  };
  const runLiveDetection = async () => {
    if (liveDetection.current) {
      liveDetection.current = false;
      return;
    }
    liveDetection.current = true;
    while (liveDetection.current) {
      const startTime = Date.now();
      const ctx = capture();
      if (!ctx) return;
      await runModel(ctx);
      setTotalTime(Date.now() - startTime);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    }
  };

  const processImage = async () => {
    reset();
    const ctx = capture();
    if (!ctx) return;

    // create a copy of the canvas
    const boxCtx = document
      .createElement("canvas")
      .getContext("2d") as CanvasRenderingContext2D;
    boxCtx.canvas.width = ctx.canvas.width;
    boxCtx.canvas.height = ctx.canvas.height;
    boxCtx.drawImage(ctx.canvas, 0, 0);

    await runModel(boxCtx);
    ctx.drawImage(boxCtx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  };

  const reset = async () => {
    var context = videoCanvasRef.current!.getContext("2d")!;
    context.clearRect(0, 0, originalSize.current[0], originalSize.current[1]);
    liveDetection.current = false;
    setDetectedItems([]);
    setInferenceTime(0);
    setTotalTime(0);

  };

  const [SSR, setSSR] = useState<boolean>(true);

  const setWebcamCanvasOverlaySize = () => {
    const element = webcamRef.current!.video!;
    if (!element) return;
    var w = element.offsetWidth;
    var h = element.offsetHeight;
    var cv = videoCanvasRef.current;
    if (!cv) return;
    cv.width = w;
    cv.height = h;
  };

  // close camera when browser tab is minimized
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        liveDetection.current = false;
      }
      // set SSR to true to prevent webcam from loading when tab is not active
      setSSR(document.hidden);
    };
    setSSR(document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  if (SSR) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-row flex-wrap justify-evenly align-center w-full">
      <div
        id="webcam-container"
        className="flex items-center justify-center webcam-container"
      >
        <Webcam
          mirrored={facingMode === "user"}
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          imageSmoothing={true}
          videoConstraints={{
            facingMode: facingMode,
          }}
          onLoadedMetadata={() => {
            setWebcamCanvasOverlaySize();
            originalSize.current = [
              webcamRef.current!.video!.offsetWidth,
              webcamRef.current!.video!.offsetHeight,
            ] as [number, number];
          }}
          forceScreenshotSourceSize={true}
          
        />
        <canvas
          id="cv1"
          ref={videoCanvasRef}
          style={{
            position: "absolute",
            zIndex: 10,
            backgroundColor: "rgba(0,0,0,0)",
          }}
        ></canvas>
      </div>
      <div className="flex flex-col justify-center items-center">
        <div className="flex gap-1 flex-row flex-wrap justify-center items-center m-5">
          <div className="flex gap-1 justify-center items-center items-stretch">
            <button
              onClick={async () => {
                const startTime = Date.now();
                await processImage();
                setTotalTime(Date.now() - startTime);
              }}
              className="p-2 border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Capture Photo
            </button>
            <button
              onClick={async () => {
                if (liveDetection.current) {
                  liveDetection.current = false;
                } else {
                  runLiveDetection();
                }
              }}
              className={`
              p-2  border-dashed border-2 rounded-xl hover:translate-y-1 
              ${liveDetection.current ? "bg-white text-black" : ""}
              
              `}
            >
              Live Detection
            </button>
          </div>
          <div className="flex gap-1 justify-center items-center items-stretch">
            <button
              onClick={() => {
                reset();
                setFacingMode(facingMode === "user" ? "environment" : "user");
              }}
              className="p-2  border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Switch Camera
            </button>
            <button
              onClick={() => {
                reset();
                props.changeModelResolution();
              }}
              className="p-2  border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Change Model
            </button>
            <button
              onClick={reset}
              className="p-2  border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Reset
            </button>
          </div>
        </div>
        <div>Using {props.modelName}</div>
        <div className="flex gap-3 flex-row flex-wrap justify-between items-center px-5 w-full">
          <div>
            {"Model Inference Time: " + inferenceTime.toFixed() + "ms"}
            <br />
            {"Total Time: " + totalTime.toFixed() + "ms"}
            <br />
            {"Overhead Time: +" + (totalTime - inferenceTime).toFixed(2) + "ms"}
          </div>
          <div>
            <div>
              {"Model FPS: " + (1000 / inferenceTime).toFixed(2) + "fps"}
            </div>
            <div>{"Total FPS: " + (1000 / totalTime).toFixed(2) + "fps"}</div>
            <div>
              {"Overhead FPS: " +
                (1000 * (1 / totalTime - 1 / inferenceTime)).toFixed(2) +
                "fps"}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center items-center">
          <h2>Checklist</h2>
          <ul>
  {Array.isArray(props.checklistItems) &&
    props.checklistItems.map((item, index) => (
      <li
        key={index}
        style={{
          textDecoration: detectedItems.includes(item) ? "line-through" : "none",
        }}
      >
        {item}
      </li>
    ))}
</ul>


        </div>
        <div className="flex items-center">
          <input
            type="text"
            value={newItem}
            onChange={handleChange}
            placeholder="Add checklist item"
            className="mr-2 px-3 py-2 border rounded-lg text-neutral-700 border-gray-300 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAddItem}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Add Item
          </button>
        </div>
      </div>

    </div>
  );
};

export default WebcamComponent;
