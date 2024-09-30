"use client";

import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/config";
import { callPersonalChefFlow } from './index';
import { FiCamera, FiChevronRight, FiRefreshCw } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';

// Component for image upload
const ImageUpload = ({ imageFile, imagePreview, handleFileUpload, setStep }) => (
  <div className="max-w-md w-full">
    <h1 className="text-3xl font-bold mb-6 text-center">What's in your fridge?</h1>
    <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
      <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <FiCamera className="w-12 h-12 text-gray-400 mb-4" />
          <p className="mb-2 text-sm text-gray-500">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </label>
    </div>
    {imagePreview && (
      <div className="mb-6">
        <img src={imagePreview} alt="Preview" className="w-full h-auto rounded-lg shadow-md" />
      </div>
    )}
    <button
      onClick={() => setStep(2)}
      disabled={!imageFile}
      className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 px-4 rounded-full shadow-md hover:from-pink-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
    >
      Next <FiChevronRight className="ml-2" />
    </button>
  </div>
);

// Component for meal customization
const MealCustomization = ({ mealType, setMealType, cuisine, setCuisine, handleSubmit, isGenerating }) => (
  <div className="max-w-md w-full">
    <h1 className="text-3xl font-bold mb-6 text-center">Customize Your Meal</h1>
    <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Meal Type</label>
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="">Select meal type</option>
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="dessert">Dessert</option>
        </select>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Cuisine</label>
        <select
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="">Select cuisine</option>
          <option value="italian">Italian</option>
          <option value="korean">Korean</option>
          <option value="junk-food">Junk Food</option>
        </select>
      </div>
    </div>
    <button
      onClick={handleSubmit}
      disabled={!mealType || !cuisine || isGenerating}
      className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 px-4 rounded-full shadow-md hover:from-pink-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
    >
      {isGenerating ? (
        <>
          <FiRefreshCw className="animate-spin mr-2" />
          Generating...
        </>
      ) : (
        "Generate Recipe"
      )}
    </button>
  </div>
);

// Component for recipe display
const RecipeDisplay = ({ recipe, setStep }) => (
  <div className="max-w-2xl w-full">
    <h1 className="text-3xl font-bold mb-6 text-center">Your Personalized Recipe</h1>
    <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
      <div className="prose max-w-none">
        <ReactMarkdown>{recipe}</ReactMarkdown>
      </div>
    </div>
    <div className="flex justify-between">
      <button
        onClick={() => setStep(2)}
        className="bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-full shadow-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-all"
      >
        Back
      </button>
      <button
        onClick={() => setStep(1)}
        className="bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 px-6 rounded-full shadow-md hover:from-pink-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all"
      >
        Start Over
      </button>
    </div>
  </div>
);

// Main component for the personal chef application
export default function Home() {
  const [step, setStep] = useState(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mealType, setMealType] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [recipe, setRecipe] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (imageFile && mealType && cuisine) {
      try {
        setIsGenerating(true);
        const storageRef = ref(storage, `fridge_images/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        const downloadURL = await getDownloadURL(storageRef);
        const generatedRecipe = await callPersonalChefFlow(downloadURL, mealType, cuisine);
        setRecipe(generatedRecipe);
        setStep(3);
      } catch (error) {
        console.error("Error uploading image or generating recipe:", error);
        setError("Failed to upload image or generate recipe. Please try again.");
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <ImageUpload imageFile={imageFile} imagePreview={imagePreview} handleFileUpload={handleFileUpload} setStep={setStep} />;
      case 2:
        return <MealCustomization mealType={mealType} setMealType={setMealType} cuisine={cuisine} setCuisine={setCuisine} handleSubmit={handleSubmit} isGenerating={isGenerating} />;
      case 3:
        return <RecipeDisplay recipe={recipe} setStep={setStep} />;
      default:
        return null;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-100">
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      {renderStep()}
    </main>
  );
}